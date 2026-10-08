import path from 'node:path';
import { PNG } from 'pngjs';
import { PngRows } from './png-stream.mjs';

export async function prepareCapture(page, scale, warnings, options = {}) {
  await page.addStyleTag({ content: 'html,body{scroll-behavior:auto!important;scroll-snap-type:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-snap-align:none!important;content-visibility:visible!important}::-webkit-scrollbar{display:none!important}' });
  return page.evaluate(async ({ scale, options }) => {
    const content = document.querySelector('[data-wx2md-body], #js_content');
    let hiddenFloating = 0, flattenedSticky = 0, expandedOverflow = 0, fittedTables = 0, fittedVectors = 0, reflowedCode = 0;
    const frozenAnimatedImages = [];
    for (const element of [...document.querySelectorAll('body *')]) {
      const position = getComputedStyle(element).position;
      if (!['fixed','sticky'].includes(position)) continue;
      if (!content.contains(element)) { element.style.setProperty('display', 'none', 'important'); hiddenFloating++; }
      else { element.style.setProperty('position', 'static', 'important'); flattenedSticky++; }
    }
    await Promise.all([...content.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
    // CSS animation suppression does not stop GIF/WebP/APNG playback. Freeze
    // frame zero at native pixel dimensions in this disposable capture DOM.
    // The saved HTML and images/ originals are never rewritten.
    for (const [index, image] of [...content.querySelectorAll('img')].entries()) {
      const source = image.currentSrc || image.src;
      const mime = /^data:(image\/(?:gif|webp|png));/i.exec(source)?.[1]?.toLowerCase();
      if (!mime || !image.naturalWidth) continue;
      const comma = source.indexOf(',');
      const binary = source.slice(0,comma).endsWith(';base64') ? atob(source.slice(comma+1)) : decodeURIComponent(source.slice(comma+1));
      const bytes = Uint8Array.from(binary, ch=>ch.charCodeAt(0));
      const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
      let animated = mime === 'image/gif';
      if (mime === 'image/png' || mime === 'image/webp') {
        const view = new DataView(bytes.buffer);
        for (let offset = mime === 'image/png' ? 8 : 12; offset + 8 <= bytes.length;) {
          const png = mime === 'image/png';
          const size = view.getUint32(offset + (png ? 0 : 4), !png);
          const kind = ascii(offset + (png ? 4 : 0), 4);
          if (kind === 'acTL' || kind === 'ANIM' || kind === 'ANMF') { animated = true; break; }
          offset += size + (png ? 12 : 8 + (size % 2));
        }
      }
      if (!animated) continue;
      if (!globalThis.ImageDecoder || !await ImageDecoder.isTypeSupported(mime)) throw new Error('采集浏览器无法固定动图帧，请安装 Chromium 后重新保存。');
      const decoder = new ImageDecoder({ data: bytes, type: mime, preferAnimation: true });
      let frame;
      try {
        await decoder.tracks.ready;
        if (!decoder.tracks.selectedTrack?.animated) continue;
        ({ image: frame } = await decoder.decode({ frameIndex: 0, completeFramesOnly: true }));
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(frame, 0, 0, canvas.width, canvas.height);
        image.removeAttribute('srcset');
        image.closest('picture')?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'));
        image.src = canvas.toDataURL('image/png'); await image.decode();
        frozenAnimatedImages.push({ index: index + 1, mime, frame: 0, width: canvas.width, height: canvas.height });
      } finally { frame?.close(); decoder.close(); }
    }
    await document.fonts.ready;
    if (options.fitToViewport) {
      const style = document.createElement('style');
      style.textContent = '#js_content img{max-width:100%!important}#js_content pre{white-space:pre-wrap!important;overflow-wrap:anywhere!important;max-width:100%!important}#js_content [data-wx2md-fit-table]{table-layout:fixed!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}#js_content [data-wx2md-fit-table] :is(th,td){width:auto!important;min-width:0!important;max-width:none!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;box-sizing:border-box!important}#js_content [data-wx2md-fit-table] :is(section,p,div,span){min-width:0!important;max-width:100%!important;white-space:normal!important;overflow-wrap:anywhere!important}';
      document.head.append(style);
      style.textContent = style.textContent.replaceAll('#js_content', ':is(#js_content,[data-wx2md-body])');
      // Code spans may override a <pre>'s whitespace; inherit the reading reflow
      // throughout the code subtree without changing the saved MD or HTML.
      const scope = ':is(#js_content,[data-wx2md-body])';
      reflowedCode = [...content.querySelectorAll('pre')].filter(pre => pre.scrollWidth > pre.clientWidth + 1).length;
      style.textContent += `${scope} pre,${scope} pre *{white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:normal!important;max-width:100%!important;min-width:0!important} ${scope} pre{box-sizing:border-box!important}`;
      // A number of WeChat math SVGs have max-width:300%!important. Rescale the
      // vector viewport and its height together; do not crop formula glyphs.
      for (const vector of content.querySelectorAll('svg')) {
        if (vector.ownerSVGElement) continue;
        const rect = vector.getBoundingClientRect();
        const available = Math.min(content.clientWidth, vector.parentElement.clientWidth || content.clientWidth);
        if (rect.width > available && rect.width > 0) {
          const viewBox = vector.viewBox?.baseVal;
          const ratio = viewBox?.width > 0 && viewBox?.height > 0 ? viewBox.width / viewBox.height : rect.width / rect.height;
          vector.style.setProperty('width', `${available}px`, 'important');
          vector.style.setProperty('height', `${available / ratio}px`, 'important');
          vector.style.setProperty('max-width', '100%', 'important');
          vector.style.setProperty('min-width', '0', 'important'); fittedVectors++;
        }
      }
      // Reflow wide tables at the chosen reading width. Do not extend the canvas
      // beyond the article column, or blank space would follow every paragraph.
      for (const table of content.querySelectorAll('table')) {
        const available = Math.min(content.clientWidth, table.parentElement.clientWidth || content.clientWidth);
        if (table.getBoundingClientRect().width > available + 1 || table.scrollWidth > available + 1) {
          table.setAttribute('data-wx2md-fit-table', ''); fittedTables++;
        }
      }
    }
    const candidates = [...content.querySelectorAll('*'), content];
    for (let ancestor = content.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) candidates.push(ancestor);
    for (const element of candidates) {
      const style = getComputedStyle(element);
      if (options.fitToViewport && element.scrollWidth > element.clientWidth + 4 && !['TD','TH','TR','TBODY','THEAD','TFOOT','SVG','MATH'].includes(element.tagName)) {
        element.style.setProperty('max-width', '100%', 'important');
        element.style.setProperty('min-width', '0', 'important');
        element.style.setProperty('overflow-wrap', 'anywhere', 'important');
        if (element.getBoundingClientRect().width > (element.parentElement?.clientWidth || innerWidth) + 1) element.style.setProperty('width', '100%', 'important');
        element.style.setProperty('overflow-x', 'visible', 'important');
      }
      if (element.scrollWidth > element.clientWidth + 4 && element.scrollWidth * scale <= 8192 && ['auto','scroll','hidden','clip'].includes(style.overflowX)) {
        element.style.setProperty('overflow', 'visible', 'important'); expandedOverflow++;
      }
      if (element.scrollHeight > element.clientHeight + 4 && element.clientHeight > 0 && ['auto','scroll','hidden','clip'].includes(style.overflowY)) {
        element.style.setProperty('max-height', 'none', 'important'); element.style.setProperty('height', 'auto', 'important'); element.style.setProperty('overflow', 'visible', 'important'); expandedOverflow++;
      }
    }
    scrollTo(0, 0);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bounds = () => ({ width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth), height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight) });
    let previous = bounds(), second = previous, stable = 0, stabilizationSamples = 0;
    // Fonts, decoded media and changed code wrapping can settle on later frames.
    // Require three consecutive stable samples, bounded to 2.4 seconds.
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 120)); second = bounds(); stabilizationSamples++;
      stable = previous.width === second.width && previous.height === second.height ? stable + 1 : 0;
      previous = second;
      if (stable >= 3) break;
    }
    if (stable < 3) throw new Error('文章排版仍在变化，无法可靠拼接，请重新保存。');
    if (options.fitToViewport && second.width > innerWidth + 1) {
      const overflowing = [...content.querySelectorAll('*')].filter(e => !e.ownerSVGElement && e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map(e => e.tagName.toLowerCase()).join('、');
      throw new Error(`正文仍有超出阅读宽度的内容${overflowing ? `（${overflowing}）` : ''}，无法生成完整长图。请查看内嵌 HTML 并反馈此链接。`);
    }
    let crop = { left: 0, width: second.width };
    if (options.cropToArticle) {
      const wrapper = content.closest('[data-wx2md-article]') || content.closest('.rich_media_area_primary_inner') || content.closest('main');
      const nodes = wrapper ? [wrapper] : [content, document.querySelector('#activity-name'), document.querySelector('#js_name')].filter(Boolean);
      const rects = nodes.map(node => node.getBoundingClientRect());
      const left = Math.max(0, Math.floor(Math.min(...rects.map(r => r.left)) - 20));
      const right = Math.min(second.width, Math.ceil(Math.max(...rects.map(r => r.right)) + 20));
      crop = { left, width: right - left };
    }
    return { ...second, crop, viewportWidth: innerWidth, viewportHeight: innerHeight, hiddenFloating, flattenedSticky, expandedOverflow, fittedTables, fittedVectors, reflowedCode, stabilizationSamples, frozenAnimatedImages };
  }, { scale, options });
}

function overlapDifference(a, b, width) {
  const top = Math.max(a.top, b.top), bottom = Math.min(a.top + a.height, b.top + b.height);
  if (bottom <= top) return null;
  let total = 0, samples = 0;
  // Sample enough pixels across the common region to detect repeated/misaligned tiles.
  for (let y = top; y < bottom; y += 3) for (let x = 2; x < width - 2; x += 4) {
    const ai = ((y - a.top) * width + x) * 4, bi = ((y - b.top) * width + x) * 4;
    for (let c = 0; c < 3; c++) { total += Math.abs(a.data[ai+c] - b.data[bi+c]); samples++; }
  }
  return samples ? total / samples : 0;
}

export async function captureScreenshot(page, directory, warnings, scale, onStage = () => {}, options = {}) {
  const layout = await prepareCapture(page, scale, warnings, options);
  const width = Math.round(layout.width * scale), height = Math.round(layout.height * scale);
  const cropLeft = Math.round(layout.crop.left * scale), outputWidth = Math.round(layout.crop.width * scale);
  if (width > 8192) throw new Error('横向内容过宽，无法可靠保存长图；请改用 HTML 查看完整内容。');
  if (options.singleFile && height > 500000) throw new Error('文章超过单张长图的保存上限（50 万像素行），请查看内嵌 HTML。');
  const overlap = 64;
  const maxPartHeight = options.singleFile ? height : Math.max(1, Math.min(100000, Math.floor(128000000 / outputWidth)));
  const partCount = Math.ceil(height / maxPartHeight);
  const stem = options.stem || 'original';
  if (path.basename(stem) !== stem || /[\\/]/.test(stem)) throw new Error('截图文件名无效。');
  const files = Array.from({ length: partCount }, (_,i) => partCount === 1 ? `${stem}.png` : `${stem}-${String(i+1).padStart(3,'0')}.png`);
  const writers = files.map((file,i) => new PngRows(path.join(directory,file),outputWidth,Math.min(maxPartHeight,height-i*maxPartHeight)));
  let covered = 0, previousBand, verticalChecks = 0, horizontalChecks = 0, maxDifference = 0;
  const tiles = [];
  try {
    while (covered < height) {
      const desiredY = Math.max(0, covered / scale - overlap);
      let band, tilePositions, actualY, end;
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.evaluate(y => scrollTo(0,y), desiredY);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const position = await page.evaluate(() => ({ y: scrollY, width: Math.max(document.documentElement.scrollWidth,document.body.scrollWidth), height: Math.max(document.documentElement.scrollHeight,document.body.scrollHeight) }));
        if (position.width !== layout.width || position.height !== layout.height) throw new Error('截图期间文章尺寸发生变化，请重新保存。');
        actualY = Math.round(position.y * scale);
        const bottom = Math.min(height, actualY + layout.viewportHeight * scale);
        end = bottom === height ? height : bottom - overlap * scale;
        if (actualY > covered || end <= covered) throw new Error('滚动位置无法覆盖下一段正文，请重新保存。');
        const rows = bottom - actualY;
        band = { top: actualY, height: rows, data: Buffer.alloc(width * rows * 4) };
        tilePositions = [];
        let coveredX = 0, previousTile;
        while (coveredX < width) {
          const desiredX = Math.max(0, coveredX / scale - overlap);
          await page.evaluate(({x,y}) => scrollTo(x,y), {x:desiredX,y:position.y});
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const actual = await page.evaluate(() => ({x:scrollX,y:scrollY}));
          if (Math.round(actual.y * scale) !== actualY) throw new Error('横向滚动改变了正文位置，请重新保存。');
          const image = PNG.sync.read(await page.screenshot({ type:'png',scale:'device',fullPage:false,animations:'disabled',caret:'hide',timeout:30000 }));
          const x = Math.round(actual.x * scale), right = Math.min(width,x + image.width);
          if (image.height !== layout.viewportHeight * scale || x > coveredX || right <= coveredX) throw new Error('截图尺寸或横向位置异常，请重新保存。');
          if (previousTile) {
            let difference=0, count=0;
            for(let row=0;row<Math.min(rows,image.height);row+=9) for(let pixel=x;pixel<coveredX;pixel+=7) {
              const a=(row*width+pixel)*4,b=(row*image.width+pixel-x)*4;
              for(let c=0;c<3;c++){difference+=Math.abs(band.data[a+c]-image.data[b+c]);count++;}
            }
            const mean=count?difference/count:0;
            if(mean>3) throw new Error('横向截图重叠区不一致，请重新保存。');
            horizontalChecks++; maxDifference=Math.max(maxDifference,mean);
          }
          const cropLeft=coveredX-x, columns=right-coveredX;
          for(let row=0;row<rows;row++) image.data.copy(band.data,(row*width+coveredX)*4,(row*image.width+cropLeft)*4,(row*image.width+cropLeft+columns)*4);
          tilePositions.push({x:actual.x,y:actual.y,cropLeft,columns});
          coveredX=right; previousTile=true;
        }
        const difference = previousBand ? overlapDifference(previousBand,band,width) : 0;
        if (previousBand && difference === null) throw new Error('相邻截图没有重叠区，无法验证接缝。');
        if (difference <= 3) { if(previousBand)verticalChecks++;maxDifference=Math.max(maxDifference,difference);break; }
        if (attempt===2) throw new Error('上下截图重叠区不一致，请重新保存。');
        await page.waitForTimeout(180);
      }
      const cropTop = covered - actualY;
      let offset = covered;
      while (offset < end) {
        const part = Math.floor(offset / maxPartHeight), rows = Math.min(end-offset,(part+1)*maxPartHeight-offset);
        if (cropLeft === 0 && outputWidth === width) {
          const begin=(offset-actualY)*width*4;
          await writers[part].add(band.data.subarray(begin,begin+rows*width*4),rows);
        } else {
          const cropped = Buffer.alloc(outputWidth * rows * 4);
          for (let row = 0; row < rows; row++) {
            const begin = ((offset-actualY+row)*width+cropLeft)*4;
            band.data.copy(cropped,row*outputWidth*4,begin,begin+outputWidth*4);
          }
          await writers[part].add(cropped,rows);
        }
        offset+=rows;
      }
      tiles.push({ top:covered,bottom:end,actualTop:actualY,cropTop,positions:tilePositions });
      covered=end; previousBand=band;
      onStage(`保存${options.label || ''}长截图 · ${Math.min(100,Math.floor(covered*100/height))}%`);
    }
    for(const writer of writers) await writer.finish();
    await page.evaluate(()=>scrollTo(0,0));
    return { files, check: { method:'viewport-stitch', layout, pixelWidth:outputWidth,capturePixelWidth:width,pixelHeight:height,coveredRows:covered,verticalChecks,horizontalChecks,maxOverlapDifference:maxDifference,complete:covered===height,tiles } };
  } catch(error) { writers.forEach(writer=>writer.abort()); throw error; }
}
