import { useEffect, useState } from 'react';
import { Avatar, Card, Col, Empty, Row, Spin, Typography, message } from 'antd';
import { Bar, Column, Pie } from '@ant-design/plots';
import { UserOutlined } from '@ant-design/icons';
import PageHeader from '@/components/PageHeader';
import RangePicker, { defaultRange, RangeValue } from '@/components/RangePicker';
import { api, formatDuration, StatisticPoint } from '@/services/api';
import styles from '@/layouts/index.less';

function queryRange(range: RangeValue) { return { from: range[0].toISOString(), to: range[1].add(1, 'minute').toISOString() }; }
function chartStyle() { return { maxWidth: 10, insetLeft: 5, insetRight: 5 }; }
type DailyChartPoint = StatisticPoint & { duration_hours: number; bar_slot: number };
function centerDailyData<T extends { date?: string }>(data: T[]) {
  const grouped = data.reduce<Record<string, T[]>>((result, point) => {
    const key = point.date || '';
    (result[key] ||= []).push(point);
    return result;
  }, {});
  const maxCount = Math.max(...Object.values(grouped).map((points) => points.length), 1);
  const slotDomain = new Set<number>();
  const centered = Object.values(grouped).flatMap((points) => points.map((point, index) => {
    const slot = index - (points.length - 1) / 2;
    slotDomain.add(slot);
    return { ...point, bar_slot: slot };
  }));
  for (let count = 1; count <= maxCount; count += 1) {
    for (let index = 0; index < count; index += 1) slotDomain.add(index - (count - 1) / 2);
  }
  return { data: centered, slotDomain: [...slotDomain].sort((left, right) => left - right) };
}
function dailyChartConfig(data: Array<{ date?: string; bar_slot: number }>, slotDomain: number[], colorField: string, height: number, yField = 'duration_hours', yTitle = '时长（小时）', tooltipItems: unknown[] = [(point: StatisticPoint) => ({ name: point.major_category, value: formatDuration(point.duration_seconds) })]) { return { data, xField: 'date', yField, seriesField: 'bar_slot', colorField, group: true, scale: { series: { domain: slotDomain } }, height, style: chartStyle(), axis: { y: { title: yTitle }, x: { title: '日期', labelAutoHide: true, tickCount: 10 } }, tooltip: { items: tooltipItems }, interaction: { tooltip: { shared: false } } } as any; }
function categoryChartConfig(data: unknown[], colorField: string, height: number, tooltipTitle?: string) { return { data, xField: 'major_category', yField: 'duration_hours', colorField, height, style: chartStyle(), axis: { x: { title: '事件大类' }, y: { title: '时长（小时）' } }, tooltip: { ...(tooltipTitle ? { title: (point: StatisticPoint) => point.user_name || point.major_category } : {}), items: [(point: StatisticPoint) => ({ name: '耗时', value: formatDuration(point.duration_seconds) })] }, interaction: { tooltip: { shared: false } } } as any; }

type CategoryDetail = { name: string; duration: number };
type DailySummaryPoint = { date?: string; user_name: string; category_count: number; category_details: CategoryDetail[] };

function escapeTooltipText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

function formatShortDuration(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function renderDailySummaryTooltip(_event: unknown, payload: { title?: string; items: Array<{ category_details?: CategoryDetail[] }> }) {
  const details = payload.items[0]?.category_details || [];
  return `<div style="min-width:220px"><div style="margin-bottom:8px;color:#6b7280">${escapeTooltipText(payload.title || '')}</div>${details.map((detail) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin:6px 0"><span style="display:inline-block;padding:0 7px;border:1px solid #91caff;border-radius:4px;background:#e6f4ff;color:#1677ff;line-height:20px;font-size:12px;white-space:nowrap">${escapeTooltipText(detail.name)}</span><span style="margin-left:auto;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${formatShortDuration(detail.duration)}</span></div>`).join('')}</div>`;
}

export default function AdminStatisticsPage() {
  const [range, setRange] = useState(defaultRange);
  const [points, setPoints] = useState<StatisticPoint[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setLoading(true); api.adminStatistics(queryRange(range)).then(({ points: result }) => setPoints(result)).catch((reason) => message.error(reason instanceof Error ? reason.message : '统计读取失败')).finally(() => setLoading(false)); }, [range]);
  const data = Object.values(points.filter((point) => point.duration_seconds > 0).reduce<Record<string, { date?: string; user_name: string; categoryDurations: Record<string, number> }>>((result, point) => {
    const key = `${point.date}\u0000${point.user_id}`;
    result[key] = result[key] || { date: point.date, user_name: point.user_name || '未知用户', categoryDurations: {} };
    result[key].categoryDurations[point.major_category] = point.duration_seconds;
    return result;
  }, {})).map(({ categoryDurations, ...point }) => ({ ...point, category_count: Object.keys(categoryDurations).length, category_details: Object.entries(categoryDurations).map(([name, duration]) => ({ name, duration })) }));
  const users = Object.values(points.reduce<Record<string, { user_id?: number; user_name: string }>>((result, point) => {
    const userName = point.user_name || '未知用户';
    const key = String(point.user_id ?? userName);
    result[key] = { user_id: point.user_id, user_name: userName };
    return result;
  }, {}));
  const userViews = users.map((user) => {
    const userPoints = points.filter((point) => point.user_id === user.user_id && point.duration_seconds > 0);
    const dailyData = userPoints.map((point) => ({ ...point, duration_hours: Number((point.duration_seconds / 3600).toFixed(2)) }));
    const categoryData = Object.values(userPoints.reduce<Record<string, { major_category: string; duration_seconds: number }>>((result, point) => {
      result[point.major_category] = result[point.major_category] || { major_category: point.major_category, duration_seconds: 0 };
      result[point.major_category].duration_seconds += point.duration_seconds;
      return result;
    }, {})).map((point) => ({ ...point, duration_hours: Number((point.duration_seconds / 3600).toFixed(2)) }));
    const centeredUserDaily = centerDailyData(dailyData);
    return { ...user, dailyData: centeredUserDaily.data, dailySlotDomain: centeredUserDaily.slotDomain, categoryData };
  });
  const categoryData = Object.values(points.filter((point) => point.duration_seconds > 0).reduce<Record<string, { major_category: string; user_name: string; duration_seconds: number }>>((result, point) => {
    const key = `${point.major_category}\u0000${point.user_name}`;
    result[key] = result[key] || { major_category: point.major_category, user_name: point.user_name || '未知用户', duration_seconds: 0 };
    result[key].duration_seconds += point.duration_seconds;
    return result;
  }, {})).map((point) => ({ ...point, duration_hours: Number((point.duration_seconds / 3600).toFixed(2)) }));
  const centeredData = centerDailyData(data);
  const config = {
    ...dailyChartConfig(centeredData.data, centeredData.slotDomain, 'user_name', 450, 'category_count', '大类数量'),
    tooltip: {
      title: (point: DailySummaryPoint) => `${point.user_name} · ${point.date}`,
      items: [(point: DailySummaryPoint) => ({ name: '大类耗时', value: '', category_details: point.category_details })],
    },
    interaction: { tooltip: { shared: false, render: renderDailySummaryTooltip } },
  };
  const categoryConfig = categoryChartConfig(categoryData, 'user_name', 400, 'user_name');
  return <div>
    <PageHeader title="用户统计" description="按用户查看每天的时间投入" />
    <Card className="page-card" style={{ marginBottom: 20 }}><RangePicker value={range} onChange={setRange} /></Card>
    {loading ? <Card className="page-card" style={{ textAlign: 'center', padding: 100 }}><Spin /></Card> : <>
      <Card className="page-card" title="用户日维度大类数量" style={{ marginBottom: 20 }}>{data.length ? <Column {...config} /> : <Empty description="暂无统计数据" />}</Card>
      <Card className="page-card" title="大类维度统计" style={{ marginBottom: 20 }}>{categoryData.length ? <Bar {...categoryConfig} /> : <Empty description="暂无统计数据" />}</Card>
      <Card className="page-card" title="用户视角">{userViews.length ? userViews.map((user, index) => {
        const pieConfig = { data: user.categoryData, angleField: 'duration_seconds', colorField: 'major_category', height: 360, radius: 0.82, label: { text: 'major_category', position: 'outside' }, tooltip: { title: (point: StatisticPoint) => point.major_category, items: [(point: StatisticPoint) => ({ name: '耗时', value: formatDuration(point.duration_seconds) })] }, interaction: { tooltip: { shared: false } } } as any;
        return <div key={user.user_id ?? user.user_name} style={{ borderTop: index ? '1px solid #edf1f5' : undefined, marginTop: index ? 28 : 0, paddingTop: index ? 28 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><Avatar icon={<UserOutlined />} className={styles.avatar} /><Typography.Title level={4} style={{ margin: 0 }}>{user.user_name}</Typography.Title></div>
          <Row gutter={[24, 24]} align="middle">
            <Col xs={24} xl={12}><div><Typography.Text strong style={{ color: '#1677ff' }}>大类耗时占比</Typography.Text>{user.categoryData.length ? <Pie {...pieConfig} /> : <Empty description="暂无统计数据" />}</div></Col>
            <Col xs={24} xl={12}><div><Typography.Text strong style={{ color: '#1677ff' }}>大类总耗时</Typography.Text>{user.categoryData.length ? <Bar {...categoryChartConfig(user.categoryData, 'major_category', 360)} /> : <Empty description="暂无统计数据" />}</div></Col>
          </Row>
          <div style={{ marginTop: 24 }}><Typography.Text strong style={{ color: '#1677ff' }}>每天的大类耗时</Typography.Text>{user.dailyData.length ? <Column {...dailyChartConfig(user.dailyData, user.dailySlotDomain, 'major_category', 380)} /> : <Empty description="暂无统计数据" />}</div>
        </div>;
      }) : <Empty description="暂无统计数据" />}</Card>
    </>}
  </div>;
}
