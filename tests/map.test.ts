import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_LAND_POLYGONS } from '../src/data/worldLand';

describe('Osiris.ai Global Map - Integridade de Dados Terrestres e Projeção', () => {
  test('Base de polígonos terrestres mundiais deve estar carregada com todos os continentes', () => {
    assert.ok(Array.isArray(WORLD_LAND_POLYGONS), 'WORLD_LAND_POLYGONS deve ser um array');
    assert.ok(WORLD_LAND_POLYGONS.length >= 200, `Esperado >= 200 polígonos, obtido ${WORLD_LAND_POLYGONS.length}`);

    let totalRings = 0;
    let totalPoints = 0;
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;

    for (const poly of WORLD_LAND_POLYGONS) {
      assert.ok(Array.isArray(poly), 'Cada polígono deve ser uma lista de anéis');
      for (const ring of poly) {
        totalRings++;
        assert.ok(ring.length >= 3, 'Cada anel deve possuir no mínimo 3 vértices');
        for (const [lon, lat] of ring) {
          totalPoints++;
          assert.equal(typeof lon, 'number', 'Longitude deve ser número');
          assert.equal(typeof lat, 'number', 'Latitude deve ser número');
          assert.ok(!Number.isNaN(lon) && Number.isFinite(lon), 'Longitude não pode ser NaN');
          assert.ok(!Number.isNaN(lat) && Number.isFinite(lat), 'Latitude não pode ser NaN');
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }

    assert.ok(totalRings >= 200, `Esperado >= 200 anéis, obtido ${totalRings}`);
    assert.ok(totalPoints >= 8000, `Esperado >= 8000 pontos, obtido ${totalPoints}`);
    // Deve cobrir os hemisférios ocidental, oriental, setentrional e meridional
    assert.ok(minLon <= -100, `Deve cobrir Américas (minLon <= -100, obtido ${minLon})`);
    assert.ok(maxLon >= 100, `Deve cobrir Ásia/Pacífico (maxLon >= 100, obtido ${maxLon})`);
    assert.ok(minLat <= -50, `Deve cobrir Antártica/Extremo Sul (minLat <= -50, obtido ${minLat})`);
    assert.ok(maxLat >= 70, `Deve cobrir Ártico/Gronelândia (maxLat >= 70, obtido ${maxLat})`);
  });

  test('Projeção 2D equirretangular mapeia coordenadas globais dentro das dimensões da tela', () => {
    const width = 1200;
    const height = 800;

    for (let p = 0; p < Math.min(20, WORLD_LAND_POLYGONS.length); p++) {
      for (const ring of WORLD_LAND_POLYGONS[p]) {
        for (const [lon, lat] of ring) {
          const x = ((lon + 180) / 360) * width;
          const y = ((90 - lat) / 180) * height;

          assert.ok(x >= 0 && x <= width + 1e-4, `X fora dos limites: ${x}`);
          assert.ok(y >= 0 && y <= height + 1e-4, `Y fora dos limites: ${y}`);
        }
      }
    }
  });

  test('Horizon clipping esférico 3D nunca produz NaN e restringe pontos ao hemisfério visível', () => {
    const rad = Math.PI / 180;
    const rotLon = 0.8;
    const rotLat = 0.2;
    const cosTilt = Math.cos(rotLat);
    const sinTilt = Math.sin(rotLat);

    let testedRings = 0;
    let visibleClippedRings = 0;

    for (let p = 0; p < WORLD_LAND_POLYGONS.length; p++) {
      for (const ring of WORLD_LAND_POLYGONS[p]) {
        testedRings++;
        const pts: { x: number; y: number; z: number }[] = [];
        for (let i = 0; i < ring.length; i++) {
          const [lon, lat] = ring[i];
          const lambda = lon * rad + rotLon;
          const phi = lat * rad;
          const cosPhi = Math.cos(phi);
          const sinPhi = Math.sin(phi);
          const cosLambda = Math.cos(lambda);
          const sinLambda = Math.sin(lambda);

          const x = cosPhi * sinLambda;
          const y = sinPhi * cosTilt - cosPhi * cosLambda * sinTilt;
          const z = sinPhi * sinTilt + cosPhi * cosLambda * cosTilt;
          pts.push({ x, y, z });
        }

        const clipped: { x: number; y: number; z: number }[] = [];
        for (let i = 0; i < pts.length; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % pts.length];
          if (p1.z >= 0 && p2.z >= 0) {
            clipped.push(p2);
          } else if (p1.z >= 0 && p2.z < 0) {
            const t = p1.z / (p1.z - p2.z);
            const ix = p1.x + t * (p2.x - p1.x);
            const iy = p1.y + t * (p2.y - p1.y);
            const len = Math.hypot(ix, iy) || 1;
            clipped.push({ x: ix / len, y: iy / len, z: 0 });
          } else if (p1.z < 0 && p2.z >= 0) {
            const t = (-p1.z) / (p2.z - p1.z);
            const ix = p1.x + t * (p2.x - p1.x);
            const iy = p1.y + t * (p2.y - p1.y);
            const len = Math.hypot(ix, iy) || 1;
            clipped.push({ x: ix / len, y: iy / len, z: 0 });
            clipped.push(p2);
          }
        }

        if (clipped.length >= 3) {
          visibleClippedRings++;
          for (const pt of clipped) {
            assert.ok(!Number.isNaN(pt.x) && Number.isFinite(pt.x), 'Ponto x não pode ser NaN');
            assert.ok(!Number.isNaN(pt.y) && Number.isFinite(pt.y), 'Ponto y não pode ser NaN');
            assert.ok(pt.z >= -1e-6, `Ponto z deve ser >= 0 no hemisfério visível: ${pt.z}`);
            // Ponto projetado na esfera deve ter raio normalizado <= 1.0001
            const r = Math.hypot(pt.x, pt.y);
            assert.ok(r <= 1.0001, `Raio normalizado na esfera excede 1: ${r}`);
          }
        }
      }
    }

    assert.ok(testedRings >= 200, 'Deve ter testado todos os anéis');
    assert.ok(visibleClippedRings >= 100, `Deve ter anéis visíveis suficientes no hemisfério frontal: ${visibleClippedRings}`);
  });
});
