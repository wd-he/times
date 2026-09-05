import { useEffect, useRef, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { Button, DatePicker, Form, Input, Space, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import CategorySelect from '@/components/CategorySelect';
import { api, Category, EventItem } from '@/services/api';
import styles from '@/pages/events/new.less';

type FormValue = { major_category_id?: number; sub_category_id?: number; description: string; started_at: Dayjs; completed_at: Dayjs };
export type EventSaveMode = 'save' | 'continue';

function toPayload(value: FormValue) {
  return { major_category_id: value.major_category_id, sub_category_id: value.sub_category_id, description: value.description, started_at: value.started_at.toISOString(), completed_at: value.completed_at.toISOString() };
}

function defaultValues() {
  return { started_at: dayjs().subtract(1, 'hour'), completed_at: dayjs(), description: '' };
}

export default function EventForm({ event, initialEvent, continuous = false, onSaved, onCancel }: { event?: EventItem; initialEvent?: EventItem; continuous?: boolean; onSaved?: (mode: EventSaveMode) => void; onCancel?: () => void }) {
  const [form] = Form.useForm<FormValue>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const saveMode = useRef<EventSaveMode>('save');

  useEffect(() => {
    api.categories().then(({ categories: result }) => setCategories(result)).catch((reason) => message.error(reason instanceof Error ? reason.message : '分类读取失败'));
  }, []);

  useEffect(() => {
    if (event) {
      form.setFieldsValue({ major_category_id: event.major_category_id, sub_category_id: event.sub_category_id, description: event.description, started_at: dayjs(event.started_at), completed_at: dayjs(event.completed_at) });
    } else if (initialEvent) {
      form.setFieldsValue({ ...defaultValues(), major_category_id: initialEvent.major_category_id, sub_category_id: initialEvent.sub_category_id, description: initialEvent.description });
    } else {
      form.setFieldsValue(defaultValues());
    }
  }, [event, initialEvent, form]);

  const quickTime = (type: string) => {
    const now = dayjs();
    const range: Record<string, [Dayjs, Dayjs]> = {
      '一上午': [now.startOf('day').hour(10), now.startOf('day').hour(12)],
      '一下午': [now.startOf('day').hour(14), now.startOf('day').hour(18)],
      '今天': [now.startOf('day').hour(10), now.startOf('day').hour(18)],
      '最近 3 小时': [now.subtract(3, 'hour'), now],
      '最近 2 小时': [now.subtract(2, 'hour'), now],
      '最近 1 小时': [now.subtract(1, 'hour'), now]
    };
    form.setFieldsValue({ started_at: range[type][0], completed_at: range[type][1] });
  };

  const resetForNext = () => {
    form.resetFields();
    form.setFieldsValue(defaultValues());
    saveMode.current = 'save';
  };

  const submit = async (value: FormValue) => {
    setLoading(true);
    try {
      if (event) await api.updateEvent(event.id, toPayload(value));
      else await api.createEvent(toPayload(value));
      message.success(event ? '事件已更新' : '事件已记录');
      const mode = continuous ? saveMode.current : 'save';
      onSaved?.(mode);
      if (mode === 'continue') resetForNext();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally { setLoading(false); }
  };

  const majorId = Form.useWatch('major_category_id', form);
  const subId = Form.useWatch('sub_category_id', form);
  return <Form form={form} layout="vertical" onFinish={submit} requiredMark="optional" size="large" className={styles.form}>
    <Form.Item name="major_category_id" label="事件大类" rules={[{ required: true, message: '请选择或新增事件大类' }]}><CategorySelect categories={categories} kind="major" value={majorId} onChange={(value) => { form.setFieldsValue({ major_category_id: value, sub_category_id: undefined }); }} onCreated={(category) => setCategories((items) => [...items.filter((item) => item.id !== category.id), category])} /></Form.Item>
    <Form.Item name="sub_category_id" label="细分类型" rules={[{ required: true, message: '请选择或新增细分类型' }]}><CategorySelect categories={categories} kind="sub" parentId={majorId} value={subId} onChange={(value) => form.setFieldsValue({ sub_category_id: value })} onCreated={(category) => setCategories((items) => [...items.filter((item) => item.id !== category.id), category])} /></Form.Item>
    <Form.Item name="description" label="事件描述" rules={[{ required: true, message: '请描述这段时间做了什么' }, { max: 2000, message: '描述不能超过 2000 个字符' }]}><Input.TextArea placeholder="例如：完成首页交互稿评审" showCount maxLength={2000} style={{ height: 260, resize: 'none' }} /></Form.Item>
    <div className={styles.timeFields}>
      <Form.Item name="started_at" label="开始时间" rules={[{ required: true, message: '请选择开始时间' }]}><DatePicker showTime format="YYYY-MM-DD HH:mm" className={styles.datetime} /></Form.Item>
      <Form.Item name="completed_at" label="完成时间" rules={[{ required: true, message: '请选择完成时间' }]}><DatePicker showTime format="YYYY-MM-DD HH:mm" className={styles.datetime} /></Form.Item>
    </div>
    <div className={styles.quickSection}>
      <div className={styles.quickTitle}><Typography.Text strong>快捷时间</Typography.Text></div>
      <Space wrap className={styles.quick}><Button onClick={() => quickTime('一上午')}>一上午</Button><Button onClick={() => quickTime('一下午')}>一下午</Button><Button onClick={() => quickTime('今天')}>今天</Button><Button onClick={() => quickTime('最近 3 小时')}>最近 3 小时</Button><Button onClick={() => quickTime('最近 2 小时')}>最近 2 小时</Button><Button onClick={() => quickTime('最近 1 小时')}>最近 1 小时</Button></Space>
    </div>
    <div className={styles.actions}>
      <Space size={20}>
        {onCancel && <Button onClick={onCancel}>取消</Button>}
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} onClick={() => { saveMode.current = 'save'; }}>{event ? '保存修改' : '保存'}</Button>
        {continuous && <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={() => { saveMode.current = 'continue'; form.submit(); }}>保存并继续</Button>}
      </Space>
    </div>
  </Form>;
}
