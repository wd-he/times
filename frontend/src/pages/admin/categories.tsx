import { useEffect, useState } from 'react';
import { Button, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { ClearOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '@/components/PageHeader';
import { AdminCategory, api } from '@/services/api';

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.adminCategories().then(({ categories: result }) => setCategories(result)).catch((reason) => message.error(reason instanceof Error ? reason.message : '读取类别失败')).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const deleteCategory = async (category: AdminCategory) => {
    try {
      await api.deleteAdminCategory(category.id);
      message.success('类别已删除');
      load();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '删除类别失败');
    }
  };

  const clearUnused = async () => {
    try {
      const result = await api.clearUnusedCategories();
      message.success(`已清除 ${result.deleted} 个未使用类别`);
      load();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '清除未使用类别失败');
    }
  };

  const columns = [
    { title: '类别名称', dataIndex: 'name', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
    { title: '类别类型', dataIndex: 'kind', render: (value: AdminCategory['kind']) => <Tag color={value === 'major' ? 'blue' : 'cyan'}>{value === 'major' ? '大类' : '细分类型'}</Tag> },
    { title: '所属用户', key: 'owner', render: (_: unknown, category: AdminCategory) => `${category.user_display_name} (${category.user_username})` },
    { title: '引用事件', dataIndex: 'event_count', render: (value: number) => `${value} 次` },
    { title: '操作', key: 'action', width: 72, render: (_: unknown, category: AdminCategory) => <Popconfirm title="确认删除这个未使用类别？" onConfirm={() => deleteCategory(category)} disabled={category.event_count > 0}><Button type="text" danger disabled={category.event_count > 0} icon={<DeleteOutlined />} /></Popconfirm> }
  ];

  return <div>
    <PageHeader title="类别管理" description="查看和清理所有用户创建的类别" extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Popconfirm title="确认清除所有未被引用的类别？" description="未使用的大类及其细分类型都会被删除。" onConfirm={clearUnused}><Button type="primary" icon={<ClearOutlined />}>清除未使用类别</Button></Popconfirm></Space>} />
    <Table rowKey="id" loading={loading} columns={columns} dataSource={categories} pagination={{ showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }} locale={{ emptyText: '暂无类别' }} />
  </div>;
}
