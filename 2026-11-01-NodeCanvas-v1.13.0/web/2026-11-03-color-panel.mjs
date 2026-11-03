import {COLOR_CONTROLS, colorSettings, drawColor} from './2026-11-03-color.mjs';

const images = new WeakMap();

export function renderColorPanel(node, source, busy, connected) {
  const settings = colorSettings(node.data.color);
  const disabled = !source || busy ? 'disabled' : '';
  return `<div class="color-panel">
    <div class="color-preview">
    <canvas hidden role="img" aria-label="색감 조정 미리보기"></canvas>
    <p role="status">${source ? '미리보기 불러오는 중…' : connected ? '연결된 노드의 이미지 결과를 기다리는 중입니다.' : '이미지 생성기 또는 편집기의 출력을 연결하세요.'}</p>
    </div>
    ${Object.entries(COLOR_CONTROLS).map(([key, label]) => `
      <label><span>${label}</span><output>${settings[key]}</output>
        <input type="range" min="-100" max="100" value="${settings[key]}" data-color="${key}" aria-label="${label}" ${disabled}>
      </label>`).join('')}
    <div class="color-actions">
      <button type="button" class="button quiet" data-action="color-compare" aria-pressed="false" ${disabled}>원본 비교</button>
      <button type="button" class="button quiet" data-action="color-reset" ${disabled}>초기화</button>
      <button type="button" class="button primary" data-action="color-save" ${disabled}>PNG 저장</button>
    </div>
  </div>`;
}

export async function loadColorPanel(panel, source, node) {
  const image = new Image();
  image.src = source;
  try {
    await image.decode();
    if (!panel.isConnected) return;
    images.set(panel, image);
    refreshColorPanel(panel, node);
    panel.querySelector('canvas').hidden = false;
    panel.querySelector('[role="status"]').hidden = true;
  } catch {
    images.delete(panel);
    panel.querySelector('[role="status"]').textContent = '연결된 이미지를 읽을 수 없습니다.';
    panel.querySelectorAll('input,button').forEach(control => control.disabled = true);
  }
}

export function refreshColorPanel(panel, node) {
  const image = images.get(panel);
  if (!image) return;
  const compare = panel.querySelector('[data-action="color-compare"]').getAttribute('aria-pressed') === 'true';
  drawColor(panel.querySelector('canvas'), image, compare ? null : node.data.color, 480);
}

export async function colorPng(panel, settings) {
  const image = images.get(panel);
  if (!image) throw new Error('이미지 미리보기가 준비될 때까지 기다려 주세요.');
  const canvas = document.createElement('canvas');
  drawColor(canvas, image, settings);
  return await new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('PNG를 만들 수 없습니다.'));
  }, 'image/png'));
}
