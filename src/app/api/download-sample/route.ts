import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { createZipArchive } from '@/lib/createZipArchive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function collectSampleFiles(
  dir: string,
  root: string
): Promise<{ name: string; data: Buffer }[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: { name: string; data: Buffer }[] = []

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectSampleFiles(absolute, root))
      continue
    }
    if (!entry.isFile()) continue
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    files.push({
      name: `sample/${relative}`,
      data: await readFile(absolute),
    })
  }

  return files
}

export async function GET() {
  try {
    const sampleRoot = path.join(process.cwd(), 'sample')
    const files = await collectSampleFiles(sampleRoot, sampleRoot)
    if (files.length === 0) {
      return NextResponse.json({ error: '示例文件暂不可用。' }, { status: 404 })
    }

    const zip = createZipArchive(files)
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="sample.zip"',
        'Content-Length': String(zip.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: '示例文件打包失败。' }, { status: 500 })
  }
}
