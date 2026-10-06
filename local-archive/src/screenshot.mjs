import path from 'node:path';
import { PNG } from 'pngjs';
import { PngRows } from './png-stream.mjs';

export async function prepareCapture(page, scale, warnings, options = {}) {
  await page.addStyleTag({ content: 'html,body{scroll-behavior:auto!important;scroll-snap-type:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-snap-align:none!important;content-visibility:visible!important}::-webkit-scrollbar{display:none!important}' });
  return page.evaluate(async ({ scale, options }) => {
    const content = document.querySelector('#js_content');
    let hiddenFloating = 0, flattenedSticky = 0, expandedOverflow = 0, fittedTables = 0;
    for (const element of [...document.querySelectorAll('body *')]) {
      const position = getComputedStyle(element).position;
      if (!['fixed','sticky'].includes(position)) continue;
      if (!content.contains(element)) { element.style.setProperty('display', 'none', 'important'); hiddenFloating++; }
      else { element.style.setProperty('position', 'static', 'important'); flattenedSticky++; }
    }
    await Promise.all([...content.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
    await document.fonts.ready;
    if (options.fitToViewport) {
      const style = document.createElement('style');
      style.textContent = '#js_content img{max-width:100%!important}#js_content pre{white-space:pre-wrap!important;overflow-wrap:anywhere!important;max-width:100%!important}#js_content [data-wx2md-fit-table]{table-layout:fixed!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}#js_content [data-wx2md-fit-table] :is(th,td){width:auto!important;min-width:0!important;max-width:none!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;box-sizing:border-box!important}#js_content [data-wx2md-fit-table] :is(section,p,div,span){min-width:0!important;max-width:100%!important;white-space:normal!important;overflow-wrap:anywhere!important}';
      document.head.append(style);
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
    const first = bounds(); await new Promise(resolve => setTimeout(resolve, 120)); const second = bounds();
    if (first.width !== second.width || first.height !== second.height) throw new Error('文章排版仍在变化，无法可靠拼接，请重新保存。');
    if (options.fitToViewport && second.width > innerWidth) throw new Error('正文仍有超出阅读宽度的内容，无法生成完整的对应比例长图。请查看内嵌 HTML。');
    let crop = { left: 0, width: second.width };
    if (options.cropToArticle) {
      const wrapper = content.closest('.rich_media_area_primary_inner') || content.closest('main');
      const nodes = wrapper ? [wrapper] : [content, document.querySelector('#activity-name'), document.querySelector('#js_name')].filter(Boolean);
      const rects = nodes.map(node => node.getBoundingClientRect());
      const left = Math.max(0, Math.floor(Math.min(...rects.map(r => r.left)) - 20));
      const right = Math.min(second.width, Math.ceil(Math.max(...rects.map(r => r.right)) + 20));
      crop = { left, width: right - left };
    }
    return { ...second, crop, viewportWidth: innerWidth, viewportHeight: innerHeight, hiddenFloating, flattenedSticky, expandedOverflow, fittedTables };
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
