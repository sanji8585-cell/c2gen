import { TimeSeriesEntry, UserRanking, ACTION_LABELS } from './adminUtils';

export function exportUsageToCSV(
  timeSeries: TimeSeriesEntry[],
  userRanking: UserRanking[],
  period: string
): void {
  const actions = new Set<string>();
  timeSeries.forEach(d => Object.keys(d.actions).forEach(a => actions.add(a)));
  const actionList = Array.from(actions);

  let csv = '일별 사용량\n';
  csv += `날짜,총비용(USD),총호출수,${actionList.map(a => `${ACTION_LABELS[a] || a}_비용,${ACTION_LABELS[a] || a}_건수`).join(',')}\n`;
  timeSeries.forEach(d => {
    const row = [
      d.date,
      d.totalCost.toFixed(4),
      d.totalCount,
      ...actionList.flatMap(a => [
        (d.actions[a]?.cost || 0).toFixed(4),
        (d.actions[a]?.count || 0).toString(),
      ]),
    ];
    csv += row.join(',') + '\n';
  });

  csv += '\n사용자별 비용 랭킹\n';
  csv += '이메일,비용(USD),호출수\n';
  userRanking.forEach(u => {
    csv += `${u.email},${u.cost.toFixed(4)},${u.count}\n`;
  });

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `usage-report-${period}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
