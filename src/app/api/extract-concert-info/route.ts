import { NextResponse } from 'next/server'
import { extractConcertInfoFromTicket } from '@/lib/ticketExtraction'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      fileName?: string
      imageData?: string
      hintText?: string
    }

    const result = await extractConcertInfoFromTicket({
      fileName: body.fileName,
      imageData: body.imageData,
      hintText: body.hintText,
    }, {
      baiduApiKey: process.env.BAIDU_OCR_API_KEY,
      baiduSecretKey: process.env.BAIDU_OCR_SECRET_KEY,
      arkApiKey: process.env.TICKET_ARK_API_KEY,
      arkBaseUrl: process.env.TICKET_ARK_BASE_URL,
      arkModel: process.env.TICKET_ARK_MODEL,
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'Invalid ticket extraction request.' },
      { status: 400 }
    )
  }
}
