// Generate PWA PNG icons from the SVG using sharp (one-off maintenance script)
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'

const svg = readFileSync('/home/z/my-project/public/icon.svg')

async function make(size) {
  const png = await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toBuffer()
  writeFileSync(`/home/z/my-project/public/icon-${size}.png`, png)
  console.log(`icon-${size}.png written`)
}

await make(192)
await make(512)
