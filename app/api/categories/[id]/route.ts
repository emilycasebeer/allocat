import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

const createErrorResponse = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status })

async function verifyOwnership(supabase: any, categoryId: string, userId: string) {
    const { data, error } = await supabase
        .from('categories')
        .select('id, is_system')
        .eq('id', categoryId)
        .eq('user_id', userId)
        .single()
    return { found: !error && !!data, is_system: data?.is_system ?? false }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const { id } = await params
        const body = await request.json()

        const { found, is_system } = await verifyOwnership(supabase, id, user.id)
        if (!found) return createErrorResponse('Category not found', 404)
        if (is_system) return createErrorResponse('System categories cannot be modified', 403)

        const { name, group_name } = body
        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

        if (name !== undefined) updatePayload.name = name.trim()

        if (group_name !== undefined) {
            // Find or create the target group
            const { data: existingGroup } = await supabase
                .from('category_groups')
                .select('id')
                .eq('user_id', user.id)
                .eq('name', group_name.trim())
                .maybeSingle()

            if (existingGroup) {
                updatePayload.group_id = existingGroup.id
            } else {
                const { data: newGroup, error: groupError } = await supabase
                    .from('category_groups')
                    .insert({
                        user_id: user.id,
                        name: group_name.trim(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .select('id')
                    .single()
                if (groupError || !newGroup) return createErrorResponse('Failed to create group', 500)
                updatePayload.group_id = newGroup.id
            }
        }

        const { data: category, error } = await supabase
            .from('categories')
            .update(updatePayload)
            .eq('id', id)
            .select(`id, name, group_id, category_groups!inner(name)`)
            .single()

        if (error) return createErrorResponse(error.message, 500)

        const grp = category.category_groups as any
        return NextResponse.json({
            category: {
                id: category.id,
                name: category.name,
                group_id: category.group_id,
                group_name: grp.name,
            }
        })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAuth(request)
        const supabase = await createServerSupabaseClient()
        const { id } = await params

        const { found, is_system } = await verifyOwnership(supabase, id, user.id)
        if (!found) return createErrorResponse('Category not found', 404)
        if (is_system) return createErrorResponse('System categories cannot be deleted', 403)

        // Soft-delete: set is_hidden = true (preserves transaction history)
        const { error } = await supabase
            .from('categories')
            .update({ is_hidden: true, updated_at: new Date().toISOString() })
            .eq('id', id)

        if (error) return createErrorResponse(error.message, 500)

        return NextResponse.json({ message: 'Category deleted' })
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return createErrorResponse('Unauthorized', 401)
        }
        return createErrorResponse('Internal server error', 500)
    }
}
