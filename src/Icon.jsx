const paths = {
  warehouse: 'm3 9 9-6 9 6v12H3V9Zm5 12V11h8v10M8 16h8',
  overview: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  door: 'M5 21V3h12v18M3 21h18M13 12h.01',
  temperature: 'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Zm3-7v10',
  history: 'M3 12a9 9 0 1 0 3-6M3 3v6h6m3-3v6l4 2',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M13 3a4 4 0 0 1 0 8M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  box: 'm12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5m-9 5v9M7.5 5.5l9 5',
  alert: 'm10.3 3.9-8.1 14A2 2 0 0 0 3.9 21h16.2a2 2 0 0 0 1.7-3.1l-8.1-14a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01',
  play: 'm8 4 13 8-13 8V4Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  refresh: 'M20 7V3l-3 3a8 8 0 1 0 3 10M20 3h-5',
  check: 'm5 12 4 4L19 6',
  signal: 'M4 16a11 11 0 0 1 16 0M7 19a7 7 0 0 1 10 0M2 12a15 15 0 0 1 20 0M12 22h.01',
  lock: 'M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2',
  search: 'M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  flask: 'M9 3h6m-5 0v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10',
};

export default function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
