import { useEffect, useState } from 'react';
import { Card, Col, Empty, Row, Spin, Typography, message } from 'antd';
import { Bar, Column, Pie } from '@ant-design/plots';
import PageHeader from '@/components/PageHeader';
import RangePicker, { defaultRange, RangeValue } from '@/components/RangePicker';
import { api, EventItem, formatDuration, StatisticPoint } from '@/services/api';

function queryRange(range: RangeValue) { return { from: range[0].toISOString(), to: range[1].add(1, 'minute').toISOString() }; }
function hours(seconds: number) { return Number((seconds / 3600).toFixed(2)); }
type DailyChartPoint = StatisticPoint & { duration_hours: number; bar_slot: number };
function chartStyle() { return { maxWidth: 10, insetLeft: 5, insetRight: 5 }; }
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
function dailyChartConfig(data: DailyChartPoint[], slotDomain: number[]) { return { data, xField: 'date', yField: 'duration_hours', seriesField: 'bar_slot', colorField: 'major_category', group: true, scale: { series: { domain: slotDomain } }, height: 330, style: chartStyle(), axis: { y: { title: '时长（小时）' }, x: { title: '日期', labelAutoHide: true } }, tooltip: { title: (point: DailyChartPoint) => `${point.date} · ${point.major_category}`, items: [(point: DailyChartPoint) => ({ name: '耗时', value: formatDuration(point.duration_seconds) })] }, interaction: { tooltip: { shared: false } } } as any; }

export default function StatisticsPage() {
  const [range, setRange] = useState(defaultRange);
  const [daily, setDaily] = useState<StatisticPoint[]>([]);
  const [byCategory, setByCategory] = useState<StatisticPoint[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = queryRange(range);
    setLoading(true);
    Promise.all([api.dailyStatistics(params), api.categoryStatistics(params), api.events(params)]).then(([dailyResult, categoryResult, eventResult]) => {
      setDaily(dailyResult.points); setByCategory(categoryResult.points); setEvents(eventResult.events);
    }).catch((reason) => message.error(reason instanceof Error ? reason.message : '统计读取失败')).finally(() => setLoading(false));
  }, [range]);

  const dailyData = daily.filter((point) => point.duration_seconds > 0).map((point) => ({ ...point, duration_hours: hours(point.duration_seconds) }));
  const categoryData = byCategory.map((point) => ({ ...point, duration_hours: hours(point.duration_seconds) }));
  const centeredDaily = centerDailyData(dailyData);
  const dailyConfig = dailyChartConfig(centeredDaily.data, centeredDaily.slotDomain);
  const categoryConfig = { data: categoryData, xField: 'major_category', yField: 'duration_hours', colorField: 'major_category', height: 520, style: chartStyle(), axis: { x: { title: '事件大类' }, y: { title: '时长（小时）' } }, tooltip: { title: (point: DailyChartPoint) => point.major_category, items: [(point: DailyChartPoint) => ({ name: '耗时', value: formatDuration(point.duration_seconds) })] }, interaction: { tooltip: { shared: false } } } as any;
  const pieConfig = { data: categoryData, angleField: 'duration_seconds', colorField: 'major_category', height: 440, radius: 0.82, label: { text: 'major_category', position: 'outside' }, tooltip: { title: (point: DailyChartPoint) => point.major_category, items: [(point: DailyChartPoint) => ({ name: '耗时', value: formatDuration(point.duration_seconds) })] }, interaction: { tooltip: { shared: false } } } as any;

  return <div>
    <PageHeader title="我的统计" description="用数据回看这一段时间的投入" />
    <Card className="page-card" style={{ marginBottom: 20 }}><RangePicker value={range} onChange={setRange} /></Card>
    {loading ? <Card className="page-card" style={{ textAlign: 'center', padding: 80 }}><Spin /></Card> : <>
      <Row gutter={[20, 20]}>
        <Col span={24}><Card className="page-card chart-card" title="大类耗时占比">{categoryData.length ? <Pie {...pieConfig} /> : <Empty description="暂无统计数据" />}</Card></Col>
        <Col span={24}><Card className="page-card chart-card" title="每天的大类耗时" extra={<Typography.Text type="secondary">共 {formatDuration(events.reduce((sum, item) => sum + item.duration_seconds, 0))}</Typography.Text>}>{dailyData.length ? <Column {...dailyConfig} /> : <Empty description="暂无统计数据" />}</Card></Col>
        <Col span={24}><Card className="page-card chart-card" title="大类总耗时">{categoryData.length ? <Bar {...categoryConfig} /> : <Empty description="暂无统计数据" />}</Card></Col>
      </Row>
    </>}
  </div>;
}
