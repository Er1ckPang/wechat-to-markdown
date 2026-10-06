import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import Packer from '../vendor/pngjs/lib/packer.js';

// PNG rows are streamed so a long image does not need one huge RGBA allocation.
export class PngRows {
  constructor(filename, width, height) {
    this.width = width; this.height = height; this.rows = 0;
    this.packer = new Packer({ filterType: 1, deflateLevel: 6, deflateStrategy: 0, colorType: 6, inputColorType: 6, bitDepth: 8 });
    this.output = createWriteStream(filename);
    this.output.on('error', error => this.deflate.destroy(error));
    this.deflate = this.packer.createDeflate();
    this.output.write(Buffer.from([137,80,78,71,13,10,26,10]));
    this.output.write(this.packer.packIHDR(width, height));
    this.reading = (async () => {
      for await (const chunk of this.deflate) if (!this.output.write(this.packer.packIDAT(chunk))) await once(this.output, 'drain');
      this.output.end(this.packer.packIEND());
      await finished(this.output);
    })();
    this.reading.catch(() => {}); // finish() surfaces the error to the caller.
  }
  async add(data, rows) {
    if (data.length !== this.width * rows * 4 || this.rows + rows > this.height) throw new Error('PNG 行数与像素数据不一致。');
    const filtered = this.packer.filterData(data, this.width, rows);
    if (!this.deflate.write(filtered)) await once(this.deflate, 'drain');
    this.rows += rows;
  }
  async finish() {
    if (this.rows !== this.height) { this.abort(); throw new Error('长截图像素行不完整。'); }
    this.deflate.end(); await this.reading;
  }
  abort() { this.deflate.destroy(); this.output.destroy(); }
}
