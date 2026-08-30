import { useState } from 'react';
import { history } from '@umijs/max';
import { Alert, Button, Card, Form, Input, Typography, message } from 'antd';
import { ClockCircleTwoTone, LockOutlined } from '@ant-design/icons';
import { api, setToken } from '@/services/api';
import styles from './login.less';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async ({ token }: { token: string }) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.login(token.trim());
      setToken(token.trim());
      localStorage.setItem('times_role', result.user.role);
      message.success(`欢迎回来，${result.user.display_name}`);
      history.replace('/events');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return <main className={styles.page}>
    <div className={styles.ornament} />
    <Card className={styles.card} bordered={false}>
      <div className={styles.logo}><ClockCircleTwoTone twoToneColor="#47c2a9" /></div>
      <Typography.Title level={2}>Times</Typography.Title>
      <Typography.Paragraph className={styles.subtitle}>把时间花在哪里，变成看得见的答案</Typography.Paragraph>
      <Form layout="vertical" size="large" onFinish={submit}>
        <Form.Item label="登录 token" name="token" rules={[{ required: true, message: '请输入 token' }]}>
          <Input prefix={<LockOutlined />} placeholder="请输入你的 token" autoFocus />
        </Form.Item>
        {error && <Alert className={styles.alert} type="error" showIcon message={error} />}
        <Button type="primary" htmlType="submit" block loading={loading}>登陆</Button>
      </Form>
      <Typography.Paragraph className={styles.tip}>首次启动时，管理员 token 会生成在服务端配置的本地文件中。</Typography.Paragraph>
    </Card>
  </main>;
}
