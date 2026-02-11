
// utils/modelGenerator.ts
import { AppState, StructuralModel, NodeEntity, ColumnEntity, BeamEntity, SlabEntity } from "../types";

export const generateModel = (state: AppState): StructuralModel => {
  const { grid, sections } = state;
  
  const nodes: NodeEntity[] = [];
  const columns: ColumnEntity[] = [];
  const beams: BeamEntity[] = [];
  const slabs: SlabEntity[] = [];

  // 1. Düğümleri (Nodes) ve Kolonları Oluştur
  let currentY = 0;
  // Y aksları döngüsü (Satırlar)
  // Not: Grid array'i "açıklık" tutuyor. İlk aks 0. noktadır.
  const ySpacings = [0, ...grid.yAxis.map(a => a.spacing)];
  const xSpacings = [0, ...grid.xAxis.map(a => a.spacing)];

  // Kümülatif koordinatları hesapla
  const yCoords = ySpacings.map((s, i) => ySpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const xCoords = xSpacings.map((s, i) => xSpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));

  for (let i = 0; i < yCoords.length; i++) {
    for (let j = 0; j < xCoords.length; j++) {
      const nodeId = `N-${j}-${i}`;
      const x = xCoords[j];
      const y = yCoords[i];

      // Düğüm Ekle
      nodes.push({ id: nodeId, x, y, axisX: `X${j+1}`, axisY: `Y${i+1}` });

      // Kolon Ekle (Her düğüme bir kolon varsayıyoruz)
      columns.push({
        id: `C-${j}-${i}`,
        nodeId: nodeId,
        b: sections.colWidth,
        h: sections.colDepth
      });
    }
  }

  // 2. Kirişleri Oluştur (Yatay ve Dikey)
  
  // Yatay Kirişler (X yönünde)
  for (let i = 0; i < yCoords.length; i++) {
    for (let j = 0; j < xCoords.length - 1; j++) {
      const startNode = `N-${j}-${i}`;
      const endNode = `N-${j+1}-${i}`;
      beams.push({
        id: `Bx-${j}-${i}`,
        startNodeId: startNode,
        endNodeId: endNode,
        length: grid.xAxis[j].spacing,
        axisId: `Y${i+1}`,
        direction: 'X',
        bw: sections.beamWidth,
        h: sections.beamDepth
      });
    }
  }

  // Dikey Kirişler (Y yönünde)
  for (let j = 0; j < xCoords.length; j++) {
    for (let i = 0; i < yCoords.length - 1; i++) {
      const startNode = `N-${j}-${i}`;
      const endNode = `N-${j}-${i+1}`;
      beams.push({
        id: `By-${j}-${i}`,
        startNodeId: startNode,
        endNodeId: endNode,
        length: grid.yAxis[i].spacing,
        axisId: `X${j+1}`,
        direction: 'Y',
        bw: sections.beamWidth,
        h: sections.beamDepth
      });
    }
  }

  // 3. Döşemeleri Oluştur (Her kapalı göz için)
  for (let i = 0; i < yCoords.length - 1; i++) {
    for (let j = 0; j < xCoords.length - 1; j++) {
      const n1 = `N-${j}-${i}`;     // Sol Alt
      const n2 = `N-${j+1}-${i}`;   // Sağ Alt
      const n3 = `N-${j+1}-${i+1}`; // Sağ Üst
      const n4 = `N-${j}-${i+1}`;   // Sol Üst

      slabs.push({
        id: `S-${j}-${i}`,
        nodes: [n1, n2, n3, n4],
        lx: grid.xAxis[j].spacing,
        ly: grid.yAxis[i].spacing,
        thickness: sections.slabThickness
      });
    }
  }

  return { nodes, columns, beams, slabs };
};
