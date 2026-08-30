import { Space, Typography } from 'antd';

export default function PageHeader({ title, description, extra }: { title: string; description?: string; extra?: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
    <div><Typography.Title level={2} className="page-title">{title}</Typography.Title>{description && <Typography.Text className="page-subtitle">{description}</Typography.Text>}</div>
    {extra && <Space>{extra}</Space>}
  </div>;
}
