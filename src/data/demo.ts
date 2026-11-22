import { dateKey, monthDate } from '../calendar'
import { entity, initialRecords, type Records } from './model'

export function demoRecords(now = new Date()): Records {
  const records = initialRecords()
  const key = (day: number) => dateKey(monthDate(now.getFullYear(), now.getMonth(), day))
  const rows = [
    [2, '월간 목표 정리', 2], [3, '디자인 리뷰', 4, '10:00'], [4, '독서 모임', 7, '19:30'],
    [5, '프로젝트 초안', 2], [6, '업무 회고', 3, '16:00'], [8, '산책', 6],
    [9, '자료 조사', 1], [10, '팀 미팅', 4, '11:00'], [11, '러닝', 6, '07:30'],
    [12, '포트폴리오 정리', 2], [12, '영어 공부', 1, '20:00'], [13, '주간 보고', 3],
    [14, '친구와 점심', 7, '12:30'], [16, '서류 준비', 3], [17, '스터디', 1, '19:00'],
    [18, '프로젝트 리뷰', 2, '14:00'], [19, '요가', 6, '18:30'], [20, '다음 주 계획', 0],
    [21, '전시 관람', 5], [23, '지원서 검토', 3], [24, '커피 약속', 7, '15:00'],
    [25, '기획 미팅', 4, '10:30'], [26, '운동', 6], [26, '발표 준비', 1, '20:00'],
    [27, '업무 정리', 3], [29, '저녁 약속', 7, '18:00'],
    [null, '읽을 책 목록 정리', 1], [null, '여행 계획 업데이트', 5], [null, '포트폴리오 백업', 2],
  ] as const
  const lastDay = monthDate(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  records.items = rows.filter(([day]) => day === null || day <= lastDay).map(([day, title, category, start], index) => ({
    ...entity(`demo-item-${index}`), title, date: day === null ? null : key(day),
    start_time: start ?? null, end_time: null, category_id: records.categories[category].id,
    completed: false, sort_order: index,
  }))
  return records
}
