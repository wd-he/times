import { Card, Col, Row, Statistic } from 'antd';
import { ClockCircleOutlined, FieldTimeOutlined, RiseOutlined } from '@ant-design/icons';
import { EventItem, formatDuration } from '@/services/api';

export default function StatCards({ events }: { events: EventItem[] }) {
  const total = events.reduce((sum, item) => sum + item.duration_seconds, 0);
  const categories = new Set(events.map((item) => item.major_category)).size;
  const average = events.length ? Math.round(total / events.length) : 0;
  return <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
    <Col xs={24} md={8}><Card className="stat-card"><Statistic title="记录总时长" value={formatDuration(total)} prefix={<ClockCircleOutlined />} /></Card></Col>
    <Col xs={24} md={8}><Card className="stat-card"><Statistic title="事件大类" value={categories} prefix={<FieldTimeOutlined />} /></Card></Col>
    <Col xs={24} md={8}><Card className="stat-card"><Statistic title="平均每次" value={formatDuration(average)} prefix={<RiseOutlined />} suffix={categories ? `· ${categories} 个大类` : ''} /></Card></Col>
  </Row>;
}
