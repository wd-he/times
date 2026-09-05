import { useEffect, useState } from 'react';
import { Card, Col, Empty, Modal, Row, Spin, Table, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { Bar, Column, Pie } from '@ant-design/plots';
import dayjs from 'dayjs';
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
function registerChartClick(chart: any, onClick: (event: unknown) => void) {
  const runtime = chart.chart;
  runtime.on('element:click', onClick);
  runtime.on('element:pointertap', onClick);
}
function dailyChartConfig(data: DailyChartPoint[], slotDomain: number[], onClick: (event: unknown) => void) { return { data, xField: 'date', yField: 'duration_hours', seriesField: 'bar_slot', colorField: 'major_category', group: true, scale: { series: { domain: slotDomain } }, height: 330, style: chartStyle(), axis: { y: { title: '时长（小时）' }, x: { title: '日期', labelAutoHide: true } }, tooltip: { title: (point: DailyChartPoint) => `${point.date} · ${point.major_category}`, items: [(point: DailyChartPoint) => ({ name: '耗时', value: formatDuration(point.duration_seconds) })] }, interaction: { tooltip: { shared: false } }, onReady: (chart: any) => registerChartClick(chart, onClick) } as any; }

function chartDatum(event: any): Partial<DailyChartPoint> | undefined {
  const data = event?.data?.data ?? event?.data;
  const datum = Array.isArray(data) ? data[0] : data;
  return datum?.data ?? datum?.datum ?? datum;
}

export default function StatisticsPage() {
  const [range, setRange] = useState(defaultRange);
  const [daily, setDaily] = useState<StatisticPoint[]>([]);
  const [byCategory, setByCategory] = useState<StatisticPoint[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailEvents, setDetailEvents] = useState<EventItem[]>([]);
  const [detailTitle, setDetailTitle] = useState('');

  useEffect(() => {
    const params = queryRange(range);
    setLoading(true);
    Promise.all([api.dailyStatistics(params), api.categoryStatistics(params), api.events(params)]).then(([dailyResult, categoryResult, eventResult]) => {
      setDaily(dailyResult.points); setByCategory(categoryResult.points); setEvents(eventResult.events);
    }).catch((reason) => message.error(reason instanceof Error ? reason.message : '统计读取失败')).finally(() => setLoading(false));
  }, [range]);

  const openDetails = (category: string, date?: string) => {
    const matched = events.filter((event) => event.major_category === category && (!date || dayjs(event.started_at).format('YYYY-MM-DD') === date));
    if (!matched.length) return;
    setDetailEvents(matched);
    setDetailTitle(`${date ? `${date} / ` : ''}${category}明细`);
  };
  const handleChartEvent = (event: unknown) => {
    const datum = chartDatum(event);
    if (datum?.major_category) openDetails(datum.major_category, datum.date);
  };

  const dailyData = daily.filter((point) => point.duration_seconds > 0).map((point) => ({ ...point, duration_hours: hours(point.duration_seconds) }));
  const categoryData = byCategory.map((point) => ({ ...point, duration_hours: hours(point.duration_seconds) }));
  const centeredDaily = centerDailyData(dailyData);
  const dailyConfig = dailyChartConfig(centeredDaily.data, centeredDaily.slotDomain, handleChartEvent);
  const categoryConfig = { data: categoryData, xField: 'major_category', yField: 'duration_hours', colorField: 'major_category', height: 520, style: chartStyle(), axis: { x: { title: '事件大类' }, y: { title: '时长（小时）' } }, tooltip: { title: (point: DailyChartPoint) => point.major_category, items: [(point: DailyChartPoint) => ({ name: '耗时', value: formatDuration(point.duration_seconds) })] }, interaction: { tooltip: { shared: false } }, onReady: (chart: any) => registerChartClick(chart, handleChartEvent) } as any;
  const pieConfig = { data: categoryData, angleField: 'duration_seconds', colorField: 'major_category', height: 440, radius: 0.82, label: { text: 'major_category', position: 'outside' }, tooltip: { title: (point: DailyChartPoint) => point.major_category, items: [(point: DailyChartPoint) => ({ name: '耗时', value: formatDuration(point.duration_seconds) })] }, interaction: { tooltip: { shared: false } }, onReady: (chart: any) => registerChartClick(chart, handleChartEvent) } as any;
  const detailColumns: TableColumnsType<EventItem> = [
    { title: '事件', dataIndex: 'description', key: 'description', render: (value: string, item: EventItem) => <div style={{ minWidth: 0 }}><Typography.Text strong ellipsis={{ tooltip: value }} style={{ display: 'block' }}>{value}</Typography.Text><div style={{ color: '#7890ad', fontSize: 12, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.major_category}{item.sub_category ? ` / ${item.sub_category}` : ''}</div></div> },
    { title: '时间', key: 'time', render: (_: unknown, item: EventItem) => <span>{dayjs(item.started_at).format('YYYY-MM-DD HH:mm')} - {dayjs(item.completed_at).format('HH:mm')}</span> },
    { title: '耗时', dataIndex: 'duration_seconds', key: 'duration', render: (value: number) => <strong>{formatDuration(value)}</strong> }
  ];

  return <div>
    <PageHeader title="我的统计" description="用数据回看这一段时间的投入" />
    <Card className="page-card" style={{ marginBottom: 20 }}><RangePicker value={range} onChange={setRange} /></Card>
    {loading ? <Card className="page-card" style={{ textAlign: 'center', padding: 80 }}><Spin /></Card> : <>
      <Row gutter={[20, 20]}>
        <Col span={24}><Card className="page-card chart-card" title="大类耗时占比">{categoryData.length ? <Pie {...pieConfig} /> : <Empty description="暂无统计数据" />}</Card></Col>
        <Col span={24}><Card className="page-card chart-card" title="每天的大类耗时" extra={<Typography.Text type="secondary">共 {formatDuration(events.reduce((sum, item) => sum + item.duration_seconds, 0))}</Typography.Text>}>{dailyData.length ? <Column {...dailyConfig} /> : <Empty description="暂无统计数据" />}</Card></Col>
        <Col span={24}><Card className="page-card chart-card" title="大类总耗时">{categoryData.length ? <Bar {...categoryConfig} /> : <Empty description="暂无统计数据" />}</Card></Col>
      </Row>
      <Modal open={Boolean(detailEvents.length)} title={detailTitle} width={960} footer={null} destroyOnHidden onCancel={() => setDetailEvents([])}><Table<EventItem> rowKey="id" tableLayout="fixed" columns={detailColumns} dataSource={detailEvents} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (total) => `共 ${total} 条` }} /></Modal>
    </>}
  </div>;
}
