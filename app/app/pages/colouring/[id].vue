<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const canvas = ref<HTMLCanvasElement | null>(null);
const ctx = ref<CanvasRenderingContext2D | null>(null);

const tolerance = ref(100);
const originalImageData = ref<ImageData | null>(null);

const fileName = route.params.id as string;

// Preset colors (kid friendly)
const presetColors = ["#ff0000", "#00aaff", "#00cc44", "#ffff00", "#ff9900", "#9900ff"];
const color = ref(presetColors[0]);

// Load image and draw it scaled to 80% viewport while preserving aspect ratio
onMounted(() => {
  loadImage();
});

function loadImage() {
  const c = canvas.value;
  if (!c) return;
  ctx.value = c.getContext("2d");

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const targetW = Math.round(window.innerWidth * 0.8);
      const targetH = Math.round(window.innerHeight * 0.8);

      // keep aspect ratio
      const scale = Math.min(targetW / img.width, targetH / img.height);
      const drawW = Math.max(1, Math.round(img.width * scale));
      const drawH = Math.max(1, Math.round(img.height * scale));

      // Set backing canvas size to scaled pixel size
      c.width = drawW;
      c.height = drawH;

      // Set CSS size so canvas displays at the correct visual size
      c.style.width = `${drawW}px`;
      c.style.height = `${drawH}px`;

      ctx.value!.clearRect(0, 0, c.width, c.height);
      ctx.value!.drawImage(img, 0, 0, drawW, drawH);

      // store original for reset
      originalImageData.value = ctx.value!.getImageData(0, 0, c.width, c.height);
    } catch (err) {
      console.error("draw image error:", err);
    }
  };
  img.onerror = (e) => {
    console.error("image load error", e);
  };
  img.src = `/images/${encodeURIComponent(fileName)}?t=${Date.now()}`;
}

// Map mouse event coordinates -> canvas pixel coordinates (handles CSS scaling)
function getCanvasCoords(e: MouseEvent) {
  const c = canvas.value!;
  const rect = c.getBoundingClientRect();
  const scaleX = c.width / rect.width;
  const scaleY = c.height / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);
  return { x, y };
}

// Async scanline flood fill (more efficient & stable than naive pixel-stack)
async function floodFillScanline(x0: number, y0: number, fillRgb: number[], tol: number) {
  try {
    if (!ctx.value || !canvas.value) return;
    const width = canvas.value.width;
    const height = canvas.value.height;
    if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return;

    const imgData = ctx.value.getImageData(0, 0, width, height);
    const data = imgData.data; // Uint8ClampedArray

    const offsetOf = (x: number, y: number) => (y * width + x) * 4;

    const startOff = offsetOf(x0, y0);
    const target = [
      data[startOff],
      data[startOff + 1],
      data[startOff + 2],
      data[startOff + 3] ?? 255,
    ];

    // if target is already effectively the chosen fill color, exit
    const fillWithAlpha = [fillRgb[0], fillRgb[1], fillRgb[2], 255];
    if (colorDistance(target, fillWithAlpha) <= tol) return;

    // helper: compare pixel at byte-offset to target with tolerance
    const matchOffset = (off: number) => {
      if (off < 0 || off + 3 >= data.length) return false;
      return (
        Math.abs(data[off] - target[0]) <= tol &&
        Math.abs(data[off + 1] - target[1]) <= tol &&
        Math.abs(data[off + 2] - target[2]) <= tol &&
        Math.abs((data[off + 3] ?? 255) - target[3]) <= tol
      );
    };

    const stack: [number, number][] = [[x0, y0]];
    let iterations = 0;

    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;

      // expand left
      let xl = x;
      let off = offsetOf(xl, y);
      while (xl >= 0 && matchOffset(off)) {
        xl--;
        off -= 4;
      }
      xl++; // move back to first matching

      // expand right
      let xr = x;
      off = offsetOf(xr, y);
      while (xr < width && matchOffset(off)) {
        xr++;
        off += 4;
      }
      xr--; // last matching

      // fill the horizontal segment [xl..xr]
      for (let xi = xl; xi <= xr; xi++) {
        const o = offsetOf(xi, y);
        data[o] = fillRgb[0];
        data[o + 1] = fillRgb[1];
        data[o + 2] = fillRgb[2];
        data[o + 3] = 255;
      }

      // check row above for new segments
      if (y - 1 >= 0) {
        let xi = xl;
        while (xi <= xr) {
          const o = offsetOf(xi, y - 1);
          if (matchOffset(o)) {
            // found a matching run above
            let runStart = xi;
            while (xi <= xr && matchOffset(offsetOf(xi, y - 1))) xi++;
            // push middle of run (scanline algorithm)
            const mid = Math.floor((runStart + (xi - 1)) / 2);
            stack.push([mid, y - 1]);
          } else {
            xi++;
          }
        }
      }

      // check row below for new segments
      if (y + 1 < height) {
        let xi = xl;
        while (xi <= xr) {
          const o = offsetOf(xi, y + 1);
          if (matchOffset(o)) {
            let runStart = xi;
            while (xi <= xr && matchOffset(offsetOf(xi, y + 1))) xi++;
            const mid = Math.floor((runStart + (xi - 1)) / 2);
            stack.push([mid, y + 1]);
          } else {
            xi++;
          }
        }
      }

      iterations++;
      // periodically yield so the renderer/UI doesn't lock up (and to avoid extreme resource spikes)
      if ((iterations & 0x3FF) === 0) { // every 1024 iterations
        await new Promise((res) => setTimeout(res, 0));
      }
    }

    // write back to canvas
    ctx.value.putImageData(imgData, 0, 0);
  } catch (err) {
    console.error("floodFillScanline error:", err);
  }
}

function colorDistance(a: number[], b: number[]) {
  // simple Manhattan distance on rgb
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function hexToRgb(hex: string) {
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

// click handler wired to template - async so we can await floodfill
async function handleClick(e: MouseEvent) {
  try {
    const { x, y } = getCanvasCoords(e);
    await floodFillScanline(x, y, hexToRgb(color.value), tolerance.value);
  } catch (err) {
    console.error("handleClick error:", err);
  }
}

// quick reset to original image (if you want)
function resetImage() {
  if (!ctx.value || !originalImageData.value) return;
  ctx.value.putImageData(originalImageData.value, 0, 0);
}

// palette helpers
function selectPreset(c: string) {
  color.value = c;
}
function handleCustomColor(e: Event) {
  color.value = (e.target as HTMLInputElement).value;
}
</script>

<template>
  <div class="coloring" style="padding: 12px;">
    <h2>{{ fileName }}</h2>

    <!-- Palette -->
    <div class="palette" style="margin-bottom: 8px;">
      <button
        v-for="c in presetColors"
        :key="c"
        :style="{ backgroundColor: c }"
        class="colorBtn"
        :class="{ active: color === c }"
        @click="selectPreset(c)"
      ></button>

      <label class="colorBtn customBtn" title="Custom color">
        +
        <input type="color" class="hiddenInput" @input="handleCustomColor" />
      </label>

      <button style="margin-left:12px;" @click="resetImage">Reset</button>
    </div>

    <!-- Tolerance slider -->
    <div class="tolerance" style="margin-bottom:12px;">
      <label for="tol">Tolerance: {{ tolerance }}</label>
      <input id="tol" type="range" min="0" max="255" v-model.number="tolerance" />
    </div>

    <!-- Canvas -->
    <div style="max-width: 100%; overflow:auto;">
      <canvas ref="canvas" @click="handleClick" style="border:1px solid #ccc; cursor:crosshair;"></canvas>
    </div>
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  gap: 8px;
  align-items: center;
}
.colorBtn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-sizing: border-box;
}
.colorBtn.active {
  border-color: #333;
  transform: translateY(-2px);
}
.customBtn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #fff;
  border: 2px dashed #888;
  font-weight: 700;
  font-size: 20px;
}
.hiddenInput { display: none; }
.tolerance { width: 240px; text-align: center; }
</style>
