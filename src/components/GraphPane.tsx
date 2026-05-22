'use client';
import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
// @ts-expect-error no types
import cytoscapeDagre from 'cytoscape-dagre';
import type { GoalSummary } from '@/types';

cytoscape.use(cytoscapeDagre as cytoscape.Ext);

const STATUS_COLORS: Record<string, string> = {
  ready: '#e8a0a0', in_progress: '#e6b85c', blocked: '#e78284', done: '#76c893',
  proposed: '#4a5060', review: '#b9a1e6', obsolete: '#4a5060',
};

function topoSort(goals: Record<string, GoalSummary>): GoalSummary[] {
  const visited = new Set<string>();
  const result: GoalSummary[] = [];
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const goal = goals[id];
    if (!goal) return;
    for (const depId of goal.dependencies ?? []) visit(depId);
    result.push(goal);
  }
  for (const id of Object.keys(goals)) visit(id);
  return result;
}

function buildElements(goals: Record<string, GoalSummary>) {
  const nodes = [], edges = [];
  for (const goal of topoSort(goals)) {
    const label = goal.title.length > 30 ? goal.title.slice(0, 29) + '…' : goal.title;
    const width = Math.max(80, Math.min(240, label.length * 13 + 28));
    nodes.push({ data: { id: goal.id, label, status: goal.status, width, textMaxWidth: `${width - 24}px` } });
    for (const parentId of goal.parent_ids ?? [])
      if (goals[parentId])
        edges.push({ data: { id: `parent-${parentId}-${goal.id}`, source: parentId, target: goal.id, edgeType: 'parent' } });
    for (const depId of goal.dependencies ?? [])
      if (goals[depId]) edges.push({ data: { id: `dep-${goal.id}-${depId}`, source: goal.id, target: depId, edgeType: 'dependency' } });
  }
  return [...nodes, ...edges];
}

function reorderSameRankByDependency(cy: cytoscape.Core, goals: Record<string, GoalSummary>) {
  const topo = topoSort(goals);
  const topoIndex = new Map(topo.map((g, i) => [g.id, i]));
  const Y_TOLERANCE = 5;
  const groups: Array<{ y: number; nodes: cytoscape.NodeSingular[] }> = [];
  cy.nodes().forEach(node => {
    const y = node.position('y');
    const group = groups.find(g => Math.abs(g.y - y) < Y_TOLERANCE);
    if (group) group.nodes.push(node);
    else groups.push({ y, nodes: [node] });
  });
  for (const { nodes } of groups) {
    if (nodes.length <= 1) continue;
    const xs = nodes.map(n => n.position('x')).sort((a, b) => a - b);
    const sorted = [...nodes].sort((a, b) => (topoIndex.get(a.data('id')) ?? 0) - (topoIndex.get(b.data('id')) ?? 0));
    sorted.forEach((node, i) => node.position('x', xs[i]));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStyle(): any[] {
  return [
    { selector: 'node', style: { shape: 'roundrectangle', width: 'data(width)', height: 'label', 'padding-top': '10px', 'padding-bottom': '10px', 'padding-left': '12px', 'padding-right': '12px', label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 'data(textMaxWidth)', 'font-size': '12px', 'font-family': 'ui-monospace, monospace', color: '#e6e0d8', 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#17191d', 'border-width': 1.5, 'border-color': '#4a5060' } },
    ...Object.entries(STATUS_COLORS).map(([status, color]) => ({ selector: `node[status="${status}"]`, style: { 'border-color': color, opacity: status === 'done' || status === 'obsolete' ? 0.55 : 1 } })),
    { selector: 'node:selected', style: { 'border-width': 2.5, 'border-color': '#ffffff', 'background-color': '#1f2228' } },
    { selector: 'edge[edgeType="parent"]', style: { 'line-style': 'solid', 'line-color': '#4a5060', 'target-arrow-color': '#4a5060', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, width: 1.5, 'curve-style': 'bezier' } },
    { selector: 'edge[edgeType="dependency"]', style: { 'line-style': 'dashed', 'line-color': '#72602a', 'target-arrow-color': '#72602a', 'target-arrow-shape': 'vee', 'arrow-scale': 0.8, width: 1.5, opacity: 0.55, 'curve-style': 'bezier' } },
  ];
}

interface Props { goals: Record<string, GoalSummary>; selectedId: string | null; onSelect: (id: string) => void; onClickBackground?: () => void; }

export function GraphPane({ goals, selectedId, onSelect, onClickBackground }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectRef = useRef(onSelect);
  const onClickBackgroundRef = useRef(onClickBackground);
  onSelectRef.current = onSelect;
  onClickBackgroundRef.current = onClickBackground;

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;
    const cy = cytoscape({ container: containerRef.current, elements: [], style: getStyle(), layout: { name: 'preset' }, minZoom: 0.2, maxZoom: 3, wheelSensitivity: 0.3 });
    cy.on('tap', 'node', (evt) => onSelectRef.current(evt.target.data('id')));
    cy.on('tap', (evt) => { if (evt.target === cy) onClickBackgroundRef.current?.(); });
    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(containerRef.current);
    cyRef.current = cy;
    return () => { ro.disconnect(); cy.destroy(); cyRef.current = null; };
  }, []);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    const elements = buildElements(goals);
    cy.batch(() => {
      const newIds = new Set(elements.map((el) => el.data.id));
      cy.elements().forEach((el) => { if (!newIds.has(el.data('id'))) el.remove(); });
      elements.forEach((el) => { const ex = cy.getElementById(el.data.id); if (ex.length) ex.data(el.data); else cy.add(el); });
    });
    cy.layout({ name: 'dagre', eles: cy.nodes().add(cy.edges('[edgeType="parent"]')), rankDir: 'TB', nodeSep: 40, rankSep: 70, animate: false, fit: false, padding: 30 } as cytoscape.LayoutOptions).run();
    reorderSameRankByDependency(cy, goals);
    cy.fit(undefined, 30);
  }, [goals]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy || !selectedId) return;
    cy.elements().unselect();
    const node = cy.getElementById(selectedId);
    if (node.length) { node.select(); cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 300 }); }
  }, [selectedId]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%', background: 'var(--bg)' }} />;
}
