import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { CopyOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import PageHeader from '@/components/PageHeader';
import { api, setToken, User } from '@/services/api';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ userId: number; token: string; username: string; suffix: string; admin: boolean }>();
  const [form] = Form.useForm<{ username: string; display_name: string }>();

  const load = () => { setLoading(true); api.users().then(({ users: result }) => setUsers(result)).catch((reason) => message.error(reason instanceof Error ? reason.message : '读取用户失败')).finally(() => setLoading(false)); };
  useEffect(load, []);

  const create = async (values: { username: string; display_name: string }) => {
    try { const result = await api.createUser(values); setCreateOpen(false); form.resetFields(); setTokenInfo({ userId: result.user.id, token: result.token, username: result.user.username, suffix: result.token.slice(result.user.username.length + 1), admin: false }); load(); } catch (reason) { message.error(reason instanceof Error ? reason.message : '创建用户失败'); }
  };
  const reset = async (user: User) => { try { const result = user.role === 'admin' ? await api.resetOwnToken() : await api.resetUserToken(user.id); if (user.role === 'admin') setToken(result.token); setTokenInfo({ userId: user.id, token: result.token, username: user.username, suffix: result.token.slice(user.username.length + 1), admin: user.role === 'admin' }); } catch (reason) { message.error(reason instanceof Error ? reason.message : '重置失败'); } };
  const toggle = async (user: User) => { try { await api.updateUser(user.id, { enabled: !user.enabled }); message.success(user.enabled ? '用户已停用' : '用户已恢复，请交付新 token'); load(); } catch (reason) { message.error(reason instanceof Error ? reason.message : '更新失败'); } };
  const persistToken = async () => {
    if (!tokenInfo) return '';
    const nextToken = `${tokenInfo.username}-${tokenInfo.suffix}`;
    if (nextToken === tokenInfo.token) return nextToken;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(tokenInfo.suffix)) throw new Error('token 尾缀只能使用英文字母、数字、下划线或短横线，且不能超过 64 个字符');
    const result = tokenInfo.admin ? await api.resetOwnToken(tokenInfo.suffix) : await api.resetUserToken(tokenInfo.userId, tokenInfo.suffix);
    if (tokenInfo.admin) setToken(result.token);
    setTokenInfo({ ...tokenInfo, token: result.token });
    return result.token;
  };
  const copyAndClose = async (createText: (token: string) => string) => { try { const token = await persistToken(); await navigator.clipboard?.writeText(createText(token)); setTokenInfo(undefined); message.success('已复制'); } catch (reason) { message.error(reason instanceof Error ? reason.message : '复制失败'); } };
  const showToken = tokenInfo ? <Modal open title="请安全保存 token" onCancel={() => setTokenInfo(undefined)} footer={<Space><Button icon={<LinkOutlined />} onClick={() => void copyAndClose((token) => { const link = new URL('/', window.location.href); link.searchParams.set('token', token); return link.toString(); })}>复制授权链接</Button><Button type="primary" icon={<CopyOutlined />} onClick={() => void copyAndClose((token) => token)}>复制并关闭</Button></Space>}><Typography.Paragraph>token 只展示这一次，可以修改短横线后面的尾缀。</Typography.Paragraph><Input addonBefore={`${tokenInfo.username}-`} value={tokenInfo.suffix} maxLength={64} onChange={(event) => setTokenInfo({ ...tokenInfo, suffix: event.target.value })} /><Typography.Paragraph code style={{ marginTop: 12, marginBottom: 0 }}>{`${tokenInfo.username}-${tokenInfo.suffix}`}</Typography.Paragraph></Modal> : null;

  const columns = [
    { title: 'username', dataIndex: 'username', render: (value: string, user: User) => <Space><Typography.Text strong>{value}</Typography.Text>{user.role === 'admin' && <Tag color="gold">超级管理员</Tag>}</Space> },
    { title: 'displayName', dataIndex: 'display_name' },
    { title: '状态', dataIndex: 'enabled', render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '正常' : '已停用'}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', render: (value: string) => new Date(value).toLocaleString('zh-CN') },
    { title: '操作', key: 'action', width: 180, onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (_: unknown, user: User) => <Space size={8}><Button onClick={() => reset(user)} icon={<SafetyCertificateOutlined />}>重置 token</Button>{user.role === 'user' && <Popconfirm title={user.enabled ? '确认停用该用户？' : '确认恢复该用户？'} onConfirm={() => toggle(user)}><Button danger={user.enabled}>{user.enabled ? '停用' : '恢复'}</Button></Popconfirm>}</Space> }
  ];

  return <div><PageHeader title="用户管理" description="管理可以记录时间的普通用户" extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新增用户</Button></Space>} /><Card className="page-card"><Table rowKey="id" loading={loading} columns={columns} dataSource={users} pagination={false} /></Card><Modal open={createOpen} title="新增普通用户" okText="创建并生成 token" cancelText="取消" onCancel={() => setCreateOpen(false)} onOk={() => form.submit()}><Form form={form} layout="vertical" onFinish={create}><Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }, { pattern: /^[A-Za-z]+$/, message: '用户名只能使用英文字母' }]}><Input autoFocus /></Form.Item><Form.Item name="display_name" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }, { max: 80, message: '显示名称不能超过 80 个字符' }]}><Input /></Form.Item></Form></Modal>{showToken}</div>;
}
