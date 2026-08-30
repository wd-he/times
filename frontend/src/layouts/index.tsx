import { useEffect, useState } from 'react';
import { history, Outlet, useLocation } from '@umijs/max';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { Avatar, Button, ConfigProvider, Layout, Menu, Modal, Space, Spin, Typography, message, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BarChartOutlined, CalendarOutlined, ClockCircleTwoTone, LogoutOutlined, PlusOutlined, TagsOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import EventForm, { EventSaveMode } from '@/components/EventForm';
import { api, clearToken, getToken, setToken, User } from '@/services/api';
import styles from './index.less';

const { Header, Sider, Content } = Layout;
const compactTheme = { algorithm: theme.compactAlgorithm };
dayjs.locale('zh-cn');

export default function AppLayout() {
  const location = useLocation();
  const [user, setUser] = useState<User>();
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const openCreate = () => setCreateOpen(true);
    window.addEventListener('times:open-event-create', openCreate);
    return () => window.removeEventListener('times:open-event-create', openCreate);
  }, []);

  useEffect(() => {
    const queryToken = new URLSearchParams(location.search || '').get('token')?.trim();
    const cleanPath = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      return `${url.pathname}${url.search}${url.hash}`;
    };
    const completeLogin = (currentUser: User) => {
      localStorage.setItem('times_role', currentUser.role);
      setUser(currentUser);
      if (queryToken) history.replace(location.pathname === '/login' ? (currentUser.role === 'admin' ? '/admin/users' : '/events') : cleanPath());
    };
    setLoading(true);
    const authentication = queryToken ? api.login(queryToken).then(({ user: currentUser }) => { setToken(queryToken); completeLogin(currentUser); }) : getToken() ? api.me().then(({ user: currentUser }) => completeLogin(currentUser)) : Promise.reject(new Error('未登录'));
    authentication.catch(() => {
      clearToken();
      if (queryToken && location.pathname === '/login') history.replace(cleanPath());
      else history.replace('/login');
    }).finally(() => setLoading(false));
  }, [location.pathname, location.search]);

  const adminRoute = location.pathname.startsWith('/admin');
  const forbiddenRoute = user && (user.role === 'admin') !== adminRoute;
  useEffect(() => {
    if (!forbiddenRoute || !user) return;
    history.replace(user.role === 'admin' ? '/admin/users' : '/events');
  }, [forbiddenRoute, user]);

  if (location.pathname === '/login') return <ConfigProvider locale={zhCN} theme={compactTheme}><Outlet /></ConfigProvider>;
  if (loading || !user) return <ConfigProvider locale={zhCN} theme={compactTheme}><div className={styles.loading}><Spin size="large" /></div></ConfigProvider>;
  if (forbiddenRoute) return <ConfigProvider locale={zhCN} theme={compactTheme}><div className={styles.loading}><Spin /></div></ConfigProvider>;

  const menuItems = user.role === 'admin' ? [
    { key: '/admin/users', icon: <TeamOutlined />, label: '用户管理' },
    { key: '/admin/categories', icon: <TagsOutlined />, label: '类别管理' },
    { key: '/admin/statistics', icon: <BarChartOutlined />, label: '用户统计' }
  ] : [
    { key: '/events', icon: <CalendarOutlined />, label: '事件记录' },
    { key: '/statistics', icon: <BarChartOutlined />, label: '我的统计' }
  ];

  const logout = () => { clearToken(); localStorage.removeItem('times_role'); history.replace('/login'); };
  const handleEventSaved = (mode: EventSaveMode) => { window.dispatchEvent(new Event('times:events-changed')); if (mode === 'save') setCreateOpen(false); };

  return <ConfigProvider locale={zhCN} theme={compactTheme}><Layout className={styles.shell}>
    <Sider breakpoint="lg" collapsible collapsed={collapsed} collapsedWidth={64} onCollapse={setCollapsed} className={styles.sider}>
      <div className={styles.brand}><ClockCircleTwoTone className={styles.brandMark} twoToneColor="#47c2a9" /><span>Times</span></div>
      <Menu theme="dark" mode="inline" selectedKeys={[menuItems.find((item) => location.pathname.startsWith(item.key))?.key || menuItems[0].key]} items={menuItems} onClick={({ key }) => history.push(key)} />
    </Sider>
    <Layout className={styles.mainLayout}>
      <Header className={styles.header}>
        {user.role === 'user' && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>快速记录</Button>}
        <Space size="middle" className={styles.headerUser}>
          <Avatar icon={<UserOutlined />} className={styles.avatar} />
          <div className={styles.userInfo}><Typography.Text strong>{`${user.display_name} (${user.username})`}</Typography.Text></div>
          <Button type="text" icon={<LogoutOutlined />} onClick={logout}>退出</Button>
        </Space>
      </Header>
      <Content className={styles.content}><Outlet /></Content>
    </Layout>
    {user.role === 'user' && <Modal open={createOpen} title="快速记录事件" width={760} footer={null} destroyOnHidden onCancel={() => setCreateOpen(false)}><EventForm continuous onSaved={handleEventSaved} onCancel={() => setCreateOpen(false)} /></Modal>}
  </Layout></ConfigProvider>;
}
