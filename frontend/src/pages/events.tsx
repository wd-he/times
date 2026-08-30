import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import EventForm from '@/components/EventForm';
import PageHeader from '@/components/PageHeader';
import RangePicker, { defaultRange, RangeValue } from '@/components/RangePicker';
import StatCards from '@/components/StatCards';
import { api, EventItem, formatDuration, User } from '@/services/api';

function queryRange(range: RangeValue) { return { from: range[0].toISOString(), to: range[1].add(1, 'minute').toISOString() }; }

type GroupMode = 'none' | 'day' | 'major';

type GroupedEvent = {
  key: string;
  day?: string;
  major_category: string;
  duration_seconds: number;
  event_count: number;
  events: EventItem[];
};

function groupEvents(events: EventItem[], mode: Exclude<GroupMode, 'none'>) {
  const groups = new Map<string, GroupedEvent>();
  events.forEach((event) => {
    const day = dayjs(event.started_at).format('YYYY-MM-DD');
    const key = mode === 'day' ? `${day}|${event.major_category}` : event.major_category;
    const current = groups.get(key);
    if (current) {
      current.duration_seconds += event.duration_seconds;
      current.event_count += 1;
      current.events.push(event);
      return;
    }
    groups.set(key, {
      key,
      day: mode === 'day' ? day : undefined,
      major_category: event.major_category,
      duration_seconds: event.duration_seconds,
      event_count: 1,
      events: [event]
    });
  });
  return Array.from(groups.values()).sort((left, right) => {
    if (mode === 'day' && left.day !== right.day) return (right.day || '').localeCompare(left.day || '');
    if (left.duration_seconds !== right.duration_seconds) return right.duration_seconds - left.duration_seconds;
    return left.major_category.localeCompare(right.major_category, 'zh-CN');
  });
}

export default function EventsPage() {
  const [range, setRange] = useState(defaultRange);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [viewEvent, setViewEvent] = useState<EventItem>();
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [selectedGroup, setSelectedGroup] = useState<GroupedEvent>();
  const csvInput = useRef<HTMLInputElement>(null);
  const isAdmin = Boolean(localStorage.getItem('times_role') === 'admin');

  const load = () => {
    setLoading(true);
    api.events({ ...queryRange(range), ...(userId ? { user_id: userId } : {}) }).then(({ events: result }) => setEvents(result)).catch((reason) => message.error(reason instanceof Error ? reason.message : '读取事件失败')).finally(() => setLoading(false));
  };

  useEffect(() => { if (isAdmin) api.users().then(({ users: result }) => setUsers(result.filter((user) => user.role === 'user' && user.enabled))).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [range, userId]);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('times:events-changed', refresh);
    return () => window.removeEventListener('times:events-changed', refresh);
  }, [range, userId]);

  const remove = async (id: number) => { try { await api.deleteEvent(id); message.success('事件已删除'); load(); } catch (reason) { message.error(reason instanceof Error ? reason.message : '删除失败'); } };
  const exportCSV = async () => {
    try {
      setCsvLoading(true);
      const blob = await api.exportEvents();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `events-${dayjs().format('YYYYMMDDHHmmss')}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.success('已导出全部事件');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '导出失败');
    } finally {
      setCsvLoading(false);
    }
  };
  const importCSV = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setCsvLoading(true);
      const result = await api.importEvents(file);
      message.success(`已新增 ${result.imported} 条事件`);
      load();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '导入失败');
    } finally {
      setCsvLoading(false);
    }
  };

  const groupedEvents = useMemo(() => groupMode === 'none' ? [] : groupEvents(events, groupMode), [events, groupMode]);
  const detailColumns: TableColumnsType<EventItem> = [
    ...(isAdmin ? [{ title: '用户', dataIndex: 'user_name', key: 'user_name', render: (value: string) => <Tag color="blue">{value}</Tag> }] : []),
    { title: '事件', dataIndex: 'description', key: 'description', render: (value: string, item: EventItem) => <div style={{ minWidth: 0 }}><Typography.Text strong ellipsis={{ tooltip: value }} style={{ display: 'block' }}>{value}</Typography.Text><div style={{ color: '#7890ad', fontSize: 12, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.major_category}{item.sub_category ? ` / ${item.sub_category}` : ''}</div></div> },
    { title: '时间', key: 'time', render: (_: unknown, item: EventItem) => <span>{dayjs(item.started_at).format('MM月DD日 HH:mm')} - {dayjs(item.completed_at).format('HH:mm')}</span> },
    { title: '耗时', dataIndex: 'duration_seconds', key: 'duration', render: (value: number) => <strong>{formatDuration(value)}</strong> },
  ];
  const columns: TableColumnsType<EventItem> = [
    ...detailColumns,
    ...(!isAdmin ? [{ title: '操作', key: 'action', width: 140, render: (_: unknown, item: EventItem) => <Space size={4}><Button type="text" icon={<EyeOutlined />} onClick={() => setViewEvent(item)}>查看</Button><Popconfirm title="确认删除这条事件？" onConfirm={() => remove(item.id)}><Button type="text" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> }] : [])
  ];
  const groupColumns: TableColumnsType<GroupedEvent> = groupMode === 'day' ? [
    { title: '日期', dataIndex: 'day', key: 'day', width: 150 },
    { title: '事件大类', dataIndex: 'major_category', key: 'major_category', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
    { title: '聚合时长', dataIndex: 'duration_seconds', key: 'duration', width: 150, render: (value: number) => <strong>{formatDuration(value)}</strong> },
    { title: '事件数量', dataIndex: 'event_count', key: 'event_count', width: 120 }
  ] : [
    { title: '事件大类', dataIndex: 'major_category', key: 'major_category', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
    { title: '聚合时长', dataIndex: 'duration_seconds', key: 'duration', width: 170, render: (value: number) => <strong>{formatDuration(value)}</strong> },
    { title: '事件数量', dataIndex: 'event_count', key: 'event_count', width: 120 }
  ];
  const changeGroupMode = (value: string | number) => {
    setGroupMode(value as GroupMode);
    setSelectedGroup(undefined);
  };

  return <div>
    <PageHeader title={isAdmin ? '事件记录' : '我的时间'} description={isAdmin ? '查看普通用户的完整时间记录' : '记录每一段值得回看的时间'} extra={!isAdmin && <Space size={16}><input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={importCSV} /><Button icon={<UploadOutlined />} loading={csvLoading} onClick={() => csvInput.current?.click()}>导入数据</Button><Button icon={<DownloadOutlined />} loading={csvLoading} onClick={exportCSV}>导出全部数据</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => window.dispatchEvent(new Event('times:open-event-create'))}>快速记录</Button></Space>} />
    <Card className="page-card" style={{ marginBottom: 20 }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {isAdmin && <Select allowClear placeholder="选择用户查看记录" style={{ width: 260 }} options={users.map((user) => ({ label: user.display_name, value: user.id }))} onChange={setUserId} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <RangePicker value={range} onChange={setRange} />
          <Space size={8}><Typography.Text type="secondary">数据列表维度</Typography.Text><Segmented options={[{ label: '不分组', value: 'none' }, { label: '天', value: 'day' }, { label: '大类', value: 'major' }]} value={groupMode} onChange={changeGroupMode} /></Space>
        </div>
      </Space>
    </Card>
    <StatCards events={events} />
    {groupMode === 'none' ? <Table<EventItem> rowKey="id" tableLayout="fixed" loading={loading} columns={columns} dataSource={events} locale={{ emptyText: <Empty description="这个时间范围还没有记录" /> }} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (total) => `共 ${total} 条` }} /> : <Table<GroupedEvent> rowKey="key" tableLayout="fixed" loading={loading} columns={groupColumns} dataSource={groupedEvents} locale={{ emptyText: <Empty description="这个时间范围还没有记录" /> }} pagination={false} onRow={(group) => ({ onClick: () => setSelectedGroup(group), style: { cursor: 'pointer' } })} />}
    {!isAdmin && <Modal open={Boolean(viewEvent)} title="查看事件" width={760} footer={null} destroyOnHidden onCancel={() => setViewEvent(undefined)}><EventForm event={viewEvent} onSaved={() => { load(); setViewEvent(undefined); }} onCancel={() => setViewEvent(undefined)} /></Modal>}
    <Modal open={Boolean(selectedGroup)} title={selectedGroup ? `${selectedGroup.day ? `${selectedGroup.day} / ` : ''}${selectedGroup.major_category}明细` : '聚合明细'} width={960} footer={null} destroyOnHidden onCancel={() => setSelectedGroup(undefined)}><Space direction="vertical" size="small" style={{ width: '100%' }}><Typography.Text type="secondary">共 {selectedGroup?.event_count || 0} 条事件 · 总时长 {formatDuration(selectedGroup?.duration_seconds || 0)}</Typography.Text><Table<EventItem> rowKey="id" tableLayout="fixed" columns={detailColumns} dataSource={selectedGroup?.events || []} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (total) => `共 ${total} 条` }} /></Space></Modal>
  </div>;
}
