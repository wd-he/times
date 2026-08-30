import { useState } from 'react';
import { Button, Divider, Select, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api, Category } from '@/services/api';

const maxCategoryNameLength = 20;

export default function CategorySelect({ categories, kind, parentId, value, onChange, onCreated }: { categories: Category[]; kind: 'major' | 'sub'; parentId?: number; value?: number; onChange: (value?: number) => void; onCreated: (category: Category) => void }) {
  const [search, setSearch] = useState('');
  const options = categories.filter((item) => item.kind === kind && (kind === 'major' || item.parent_id === parentId)).map((item) => ({ label: item.name, value: item.id }));
  const create = async () => {
    const name = search.trim();
    if (!name) return;
    try {
      const result = await api.createCategory({ name, kind, ...(kind === 'sub' ? { parent_id: parentId } : {}) });
      if (result.category) {
        onCreated(result.category);
        onChange(result.category.id);
      }
      setSearch('');
      message.success('分类已保存');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '分类保存失败');
    }
  };
  return <Select allowClear showSearch searchValue={search} value={value} options={options} placeholder={`选择或输入${kind === 'major' ? '事件大类' : '细分类型'}`} onSearch={(value) => setSearch(Array.from(value).slice(0, maxCategoryNameLength).join(''))} onInputKeyDown={(event) => { if (event.nativeEvent.isComposing || event.keyCode === 229) return; if (event.key === 'Enter' && search.trim()) { event.preventDefault(); event.stopPropagation(); void create(); } }} onChange={(value) => { setSearch(''); onChange(value); }} filterOption={(input, option) => String(option?.label || '').toLowerCase().includes(input.toLowerCase())} dropdownRender={(menu) => <><div>{menu}</div><Divider style={{ margin: '8px 0' }} /><Button type="link" icon={<PlusOutlined />} disabled={!search.trim()} onMouseDown={(event) => event.preventDefault()} onClick={create}>新增"{search.trim()}"</Button></>} />;
}
