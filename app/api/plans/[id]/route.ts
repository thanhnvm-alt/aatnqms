
import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

const getClient = () => {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not defined");
  
  return createClient({
    url: url.startsWith('libsql://') ? url.replace('libsql://', 'https://') : url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: 'number',
  });
};

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const body = await request.json();
    const client = getClient();

    // Construct dynamic update query
    const fields = Object.keys(body).filter(k => k !== 'id' && k !== 'created_at');
    if (fields.length === 0) return NextResponse.json({ success: false, error: 'No fields to update' });

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => body[f]);

    const result = await client.execute({
      sql: `UPDATE searchPlans SET ${setClause} WHERE id = ? RETURNING *`,
      args: [...values, id]
    });

    return NextResponse.json({ success: true, data: result.rows[0], message: 'Updated successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const client = getClient();
    await client.execute({
      sql: `DELETE FROM searchPlans WHERE id = ?`,
      args: [params.id]
    });
    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
