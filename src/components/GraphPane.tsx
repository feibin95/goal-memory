'use client';
import { useEffect, useRef, useState } from 'react';
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

function buildChildrenIndex(goals: Record<string, GoalSummary>): Record<string, string[]> {
  const children: Record<string, string[]> = {};
  for (const g of Object.values(goals)) {
    for (const pid of g.parent_ids ?? []) {
      (children[pid] ??= []).push(g.id);
    }
  }
  return children;
}

function computeHiddenIds(goals: Record<string, GoalSummary>, collapsedIds: Set<string>): Set<string> {
  const children = buildChildrenIndex(goals);
  const hidden = new Set<string>();
  const queue = [...collapsedIds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const cid of children[id] ?? []) {
      if (!hidden.has(cid)) { hidden.add(cid); queue.push(cid); }
    }
  }
  return hidden;
}

// Build ALL elements with no filtering — collapse is handled via hide/show
function buildAllElements(goals: Record<string, GoalSummary>) {
  const nodes = [], edges = [];
  for (const goal of topoSort(goals)) {
    const baseLabel = goal.title.length > 30 ? goal.title.slice(0, 29) + '…' : goal.title;
    const width = Math.max(80, Math.min(240, baseLabel.length * 13 + 28));
    nodes.push({ data: { id: goal.id, label: baseLabel, baseLabel, status: goal.status, width, textMaxWidth: `${width - 24}px`, collapsed: false } });
    for (const parentId of goal.parent_ids ?? [])
      if (goals[parentId])
        edges.push({ data: { id: `parent-${parentId}-${goal.id}`, source: parentId, target: goal.id, edgeType: 'parent' } });
    for (const depId of goal.dependencies ?? [])
      if (goals[depId])
        edges.push({ data: { id: `dep-${goal.id}-${depId}`, source: goal.id, target: depId, edgeType: 'dependency' } });
  }
  return [...nodes, ...edges];
}

// Apply collapse via hide/show — positions are NEVER touched (hide is style-layer only)
function applyCollapseState(
  cy: cytoscape.Core,
  goals: Record<string, GoalSummary>,
  collapsedIds: Set<string>,
): Set<string> {
  const children = buildChildrenIndex(goals);
  const hiddenIds = computeHiddenIds(goals, collapsedIds);
  cy.batch(() => {
    cy.nodes().forEach(n => {
      const id = n.data('id') as string;
      if (hiddenIds.has(id)) {
        n.hide();
      } else {
        n.show();
        const isCollapsed = collapsedIds.has(id);
        const hiddenChildCount = (children[id] ?? []).filter(c => hiddenIds.has(c)).length;
        const baseLabel = n.data('baseLabel') as string;
        const label = isCollapsed && hiddenChildCount > 0 ? `${baseLabel} [+${hiddenChildCount}]` : baseLabel;
        const width = Math.max(80, Math.min(240, label.length * 13 + 28));
        n.data({ label, width, textMaxWidth: `${width - 24}px`, collapsed: isCollapsed });
      }
    });
    cy.edges().forEach(e => {
      const srcHidden = hiddenIds.has(e.source().data('id') as string);
      const tgtHidden = hiddenIds.has(e.target().data('id') as string);
      if (srcHidden || tgtHidden) e.hide(); else e.show();
    });
  });
  return hiddenIds;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStyle(): any[] {
  return [
    { selector: 'node', style: { shape: 'roundrectangle', width: 'data(width)', height: 'label', 'padding-top': '10px', 'padding-bottom': '10px', 'padding-left': '12px', 'padding-right': '12px', label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 'data(textMaxWidth)', 'font-size': '12px', 'font-family': 'ui-monospace, monospace', color: '#e6e0d8', 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#17191d', 'border-width': 1.5, 'border-color': '#4a5060' } },
    ...Object.entries(STATUS_COLORS).map(([status, color]) => ({ selector: `node[status="${status}"]`, style: { 'border-color': color, opacity: status === 'done' || status === 'obsolete' ? 0.55 : 1 } })),
    { selector: 'node:selected', style: { 'border-width': 2.5, 'border-color': '#ffffff', 'background-color': '#1f2228' } },
    { selector: 'node[?collapsed]', style: { 'border-style': 'dashed', 'border-width': 2 } },
    { selector: 'edge[edgeType="parent"]', style: { 'line-style': 'solid', 'line-color': '#4a5060', 'target-arrow-color': '#4a5060', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, width: 1.5, 'curve-style': 'bezier' } },
    { selector: 'edge[edgeType="dependency"]', style: { 'line-style': 'dashed', 'line-color': '#72602a', 'target-arrow-color': '#72602a', 'target-arrow-shape': 'vee', 'arrow-scale': 0.8, width: 1.5, opacity: 0.55, 'curve-style': 'bezier' } },
  ];
}

interface CuePos { id: string; x: number; y: number; collapsed: boolean; }

interface Props {
  goals: Record<string, GoalSummary>;
  selectedId: string | null;
  collapsedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onClickBackground?: () => void;
}

export function GraphPane({ goals, selectedId, collapsedIds, onSelect, onToggleCollapse, onClickBackground }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectRef = useRef(onSelect);
  const onClickBackgroundRef = useRef(onClickBackground);
  const onToggleCollapseRef = useRef(onToggleCollapse);
  const goalsRef = useRef(goals);
  const collapsedIdsRef = useRef(collapsedIds);
  const prevGoalsRef = useRef(goals);
  onSelectRef.current = onSelect;
  onClickBackgroundRef.current = onClickBackground;
  onToggleCollapseRef.current = onToggleCollapse;
  goalsRef.current = goals;
  collapsedIdsRef.current = collapsedIds;

  const [cuePositions, setCuePositions] = useState<CuePos[]>([]);
  const [canvasZoom, setCanvasZoom] = useState(1);

  const updateCues = () => {
    const cy = cyRef.current;
    if (!cy) return;
    setCanvasZoom(cy.zoom());
    const currentGoals = goalsRef.current;
    const currentCollapsed = collapsedIdsRef.current;
    const childrenOf: Record<string, boolean> = {};
    Object.values(currentGoals).forEach(g => {
      (g.parent_ids ?? []).forEach(pid => { childrenOf[pid] = true; });
    });
    // Only show cue buttons for VISIBLE nodes that have children
    const cues: CuePos[] = cy.nodes(':visible').toArray()
      .filter(n => childrenOf[n.data('id') as string])
      .map(n => {
        const bb = n.renderedBoundingBox({});
        return { id: n.data('id') as string, x: (bb.x1 + bb.x2) / 2, y: bb.y2, collapsed: currentCollapsed.has(n.data('id') as string) };
      });
    setCuePositions(cues);
  };

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;
    const cy = cytoscape({ container: containerRef.current, elements: [], style: getStyle(), layout: { name: 'preset' }, minZoom: 0.2, maxZoom: 3, wheelSensitivity: 0.3 });
    cy.on('tap', 'node', (evt) => onSelectRef.current(evt.target.data('id')));
    cy.on('tap', (evt) => { if (evt.target === cy) onClickBackgroundRef.current?.(); });
    cy.on('layoutstop viewport', updateCues);
    const ro = new ResizeObserver(() => { cy.resize(); updateCues(); });
    ro.observe(containerRef.current);
    cyRef.current = cy;
    return () => { ro.disconnect(); cy.destroy(); cyRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    const goalsChanged = goals !== prevGoalsRef.current;
    prevGoalsRef.current = goals;

    if (goalsChanged) {
      // Rebuild elements only — layout runs below on visible nodes
      const elements = buildAllElements(goals);
      cy.batch(() => {
        const newIds = new Set(elements.map(el => el.data.id));
        cy.elements().forEach(el => { if (!newIds.has(el.data('id'))) el.remove(); });
        elements.forEach(el => {
          const ex = cy.getElementById(el.data.id);
          if (ex.length) ex.data(el.data); else cy.add(el);
        });
      });
    }

    // Apply collapse via hide/show, then layout only visible nodes
    applyCollapseState(cy, goals, collapsedIds);
    const layout = cy.layout({
      name: 'dagre',
      eles: cy.nodes(':visible').add(cy.edges(':visible').filter('[edgeType="parent"]')),
      rankDir: 'TB', nodeSep: 40, rankSep: 70,
      animate: !goalsChanged,
      animationDuration: 250,
      fit: false,
      padding: 30,
    } as cytoscape.LayoutOptions);
    layout.on('layoutstop', () => cy.fit(undefined, 30));
    layout.run();
    // cy.on('layoutstop', updateCues) already registered — no manual call needed
  }, [goals, collapsedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cy = cyRef.current; if (!cy || !selectedId) return;
    cy.elements().unselect();
    const node = cy.getElementById(selectedId);
    if (node.length) { node.select(); cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 300 }); }
  }, [selectedId]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%', background: 'var(--bg)' }} />
      {cuePositions.map(({ id, x, y, collapsed }) => {
        const btnSize = Math.round(14 * canvasZoom);
        const half = btnSize / 2;
        return (
          <button
            key={id}
            onClick={() => onToggleCollapseRef.current(id)}
            title={collapsed ? '展开子目标' : '收起子目标'}
            style={{
              position: 'absolute',
              left: x - half,
              top: y - half,
              width: btnSize,
              height: btnSize,
              borderRadius: '50%',
              border: `${Math.max(0.5, canvasZoom)}px solid ${collapsed ? '#e6b85c' : '#4a5060'}`,
              background: '#17191d',
              color: collapsed ? '#e6b85c' : '#8a9ab5',
              fontSize: Math.round(10 * canvasZoom),
              lineHeight: `${Math.round(12 * canvasZoom)}px`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              padding: 0,
              userSelect: 'none',
            }}
          >
            {collapsed ? '+' : '−'}
          </button>
        );
      })}
    </div>
  );
}
