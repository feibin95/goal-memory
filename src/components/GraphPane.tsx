'use client';
import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
// @ts-expect-error no types
import cytoscapeDagre from 'cytoscape-dagre';
import type { Goal } from '@/types';

cytoscape.use(cytoscapeDagre as cytoscape.Ext);

const STATUS_COLORS: Record<string, string> = {
  ready: '#e8a0a0', in_progress: '#e6b85c', blocked: '#e78284', done: '#76c893',
  proposed: '#4a5060', review: '#b9a1e6', obsolete: '#4a5060',
};

function buildElements(goals: Record<string, Goal>) {
  const nodes = [], edges = [];
  for (const goal of Object.values(goals)) {
    nodes.push({ data: { id: goal.id, label: goal.title.length > 30 ? goal.title.slice(0, 29) + '…' : goal.title, status: goal.status } });
    if (goal.parent_id && goals[goal.parent_id])
      edges.push({ data: { id: `parent-${goal.id}`, source: goal.parent_id, target: goal.id, edgeType: 'parent' } });
    for (const depId of goal.dependencies ?? [])
      if (goals[depId]) edges.push({ data: { id: `dep-${goal.id}-${depId}`, source: goal.id, target: depId, edgeType: 'dependency' } });
  }
  return [...nodes, ...edges];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStyle(): any[] {
  return [
    { selector: 'node', style: { shape: 'roundrectangle', width: 160, height: 'label', 'padding-top': '10px', 'padding-bottom': '10px', 'padding-left': '12px', 'padding-right': '12px', label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '136px', 'font-size': '12px', 'font-family': 'ui-monospace, monospace', color: '#e6e0d8', 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#17191d', 'border-width': 1.5, 'border-color': '#4a5060' } },
    ...Object.entries(STATUS_COLORS).map(([status, color]) => ({ selector: `node[status="${status}"]`, style: { 'border-color': color, opacity: status === 'done' || status === 'obsolete' ? 0.55 : 1 } })),
    { selector: 'node:selected', style: { 'border-width': 2.5, 'border-color': '#ffffff', 'background-color': '#1f2228' } },
    { selector: 'edge[edgeType="parent"]', style: { 'line-style': 'solid', 'line-color': '#4a5060', 'target-arrow-color': '#4a5060', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, width: 1.5, 'curve-style': 'bezier' } },
    { selector: 'edge[edgeType="dependency"]', style: { 'line-style': 'dashed', 'line-color': '#72602a', 'target-arrow-color': '#72602a', 'target-arrow-shape': 'vee', 'arrow-scale': 0.8, width: 1.5, opacity: 0.55, 'curve-style': 'bezier' } },
  ];
}

interface Props { goals: Record<string, Goal>; selectedId: string | null; onSelect: (id: string) => void; }

export function GraphPane({ goals, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;
    const cy = cytoscape({ container: containerRef.current, elements: [], style: getStyle(), layout: { name: 'preset' }, minZoom: 0.2, maxZoom: 3, wheelSensitivity: 0.3 });
    cy.on('tap', 'node', (evt) => onSelectRef.current(evt.target.data('id')));
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
    cy.layout({ name: 'dagre', eles: cy.nodes().add(cy.edges('[edgeType="parent"]')), rankDir: 'TB', nodeSep: 40, rankSep: 70, animate: Object.keys(goals).length <= 50, animationDuration: 250, fit: true, padding: 30 } as cytoscape.LayoutOptions).run();
  }, [goals]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy || !selectedId) return;
    cy.elements().unselect();
    const node = cy.getElementById(selectedId);
    if (node.length) { node.select(); cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 300 }); }
  }, [selectedId]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%', background: 'var(--bg)' }} />;
}
