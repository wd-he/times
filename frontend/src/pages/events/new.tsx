import { useEffect, useState } from 'react';
import { history, useParams } from '@umijs/max';
import { Button, Card, Empty, Spin, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import EventForm from '@/components/EventForm';
import PageHeader from '@/components/PageHeader';
import { api, EventItem } from '@/services/api';

export default function EventFormPage() {
  const { id } = useParams<{ id?: string }>();
  const [event, setEvent] = useState<EventItem>();
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    if (!id) return;
    api.events().then(({ events }) => setEvent(events.find((item) => item.id === Number(id)))).catch((reason) => message.error(reason instanceof Error ? reason.message : '事件读取失败')).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin /></div>;
  if (id && !event) return <Empty description="事件不存在" />;

  const editing = Boolean(id);
  return <div>
    <PageHeader title={editing ? '编辑事件' : '记录一段时间'} description="把刚刚完成的事情留下来，之后才能看见时间的形状" extra={<Button icon={<ArrowLeftOutlined />} onClick={() => history.push('/events')}>返回记录</Button>} />
    <Card className="page-card"><EventForm event={event} onSaved={() => history.push('/events')} onCancel={() => history.push('/events')} /></Card>
  </div>;
}
