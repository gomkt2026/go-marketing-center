/** 公開頁與素材庫顯示用。截圖本體與說明在 functions/_shared/taskgo-product-films.ts。 */
export const TASKGO_PRODUCT_FILMS = [
  {
    id: 'attendance',
    video: '/brands/taskgo/films/attendance.mp4',
    poster: '/brands/taskgo/films/stills/attendance-dashboard.jpg',
    stills: ['打卡出勤｜專案儀表板', '打卡出勤｜每日報表', '打卡出勤｜GPS 距離警示'],
  },
  {
    id: 'closeout',
    video: '/brands/taskgo/films/closeout.mp4',
    poster: '/brands/taskgo/films/stills/closeout-photos.jpg',
    stills: ['結案報告｜施工照片', '結案報告｜服務單位'],
  },
  {
    id: 'field',
    video: '/brands/taskgo/films/field.mp4',
    poster: '/brands/taskgo/films/stills/field-progress.jpg',
    stills: ['現場管理｜本月任務', '現場管理｜現場照片', '現場管理｜請款收款'],
  },
  {
    id: 'map',
    video: '/brands/taskgo/films/map.mp4',
    poster: '/brands/taskgo/films/stills/map-pins.jpg',
    stills: ['專案地圖｜點圖釘', '專案地圖｜施工照片', '專案地圖｜維修車'],
  },
] as const;

export type TaskgoProductFilmId = (typeof TASKGO_PRODUCT_FILMS)[number]['id'];
