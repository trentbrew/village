import React from 'react';
import { NodeResizer } from '@reactflow/node-resizer';
import '@reactflow/node-resizer/dist/style.css';

type BasicNodeProps = {
  id: string;
  selected?: boolean;
  data?: { label?: string } & Record<string, unknown>;
  style?: React.CSSProperties;
};

export default function BasicNode({ selected, data }: BasicNodeProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#fff',
        borderRadius: 8,
        border: '1px solid #e5e5e5',
        display: 'grid',
        placeItems: 'center',
        padding: 8,
      }}
    >
      <NodeResizer isVisible={!!selected} minWidth={80} minHeight={40}>
        {/* Node content */}
      </NodeResizer>
      <div style={{ pointerEvents: 'none', fontWeight: 600 }}>
        {data?.label || 'Node'}
      </div>
    </div>
  );
}
