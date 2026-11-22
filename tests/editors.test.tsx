// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { initialRecords } from '../src/data/model'
import { ItemEditor } from '../src/ui/editors'

afterEach(cleanup)

it('제목만으로 날짜 미지정 항목을 저장한다', async () => {
  const { categories } = initialRecords()
  const save = vi.fn().mockResolvedValue(undefined)
  render(<ItemEditor date={null} defaultCategory={categories[0].id} categories={categories} save={save} remove={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: '  제목만  ' } })
  fireEvent.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
    title: '제목만', start_time: null, end_time: null, date: null, category_id: categories[0].id,
  })))
})

it('선택한 시작 및 종료 시간, 카테고리와 인접 월 날짜를 저장한다', async () => {
  const { categories } = initialRecords()
  const save = vi.fn().mockResolvedValue(undefined)
  render(<ItemEditor date="2026-09-01" defaultCategory={categories[0].id} categories={categories} save={save} remove={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: '예약' } })
  fireEvent.change(screen.getByLabelText('카테고리'), { target: { value: categories[2].id } })
  fireEvent.click(screen.getByLabelText('시간 지정'))
  fireEvent.change(screen.getByLabelText('시작 시간'), { target: { value: '15:00' } })
  fireEvent.change(screen.getByLabelText('종료 시간'), { target: { value: '16:00' } })
  fireEvent.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
    title: '예약', start_time: '15:00', end_time: '16:00', date: '2026-09-01', category_id: categories[2].id,
  })))
})
