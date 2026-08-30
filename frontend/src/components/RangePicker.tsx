import { useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { DatePicker, Segmented } from 'antd';

export type RangeValue = [Dayjs, Dayjs];

export const defaultRange = (): RangeValue => [dayjs().startOf('week'), dayjs().endOf('day')];

function quickRange(selected: string): RangeValue {
  const day = dayjs().subtract(selected === '昨天' ? 1 : selected === '前天' ? 2 : 0, 'day');
  if (selected === '今天' || selected === '昨天' || selected === '前天') return [day.startOf('day'), day.endOf('day')];
  const end = dayjs().endOf('day');
  const start = selected === '本周' ? dayjs().startOf('week') : selected === '最近7天' ? dayjs().subtract(6, 'day').startOf('day') : selected === '本月' ? dayjs().startOf('month') : dayjs().subtract(29, 'day').startOf('day');
  return [start, end];
}

export default function RangePicker({ value, onChange }: { value: RangeValue; onChange: (value: RangeValue) => void }) {
  const options = ['前天', '昨天', '今天', '本周', '最近7天', '最近30天', '本月'];
  const [selectedOption, setSelectedOption] = useState<string>();
  const inferredOption = options.find((option) => {
    const range = quickRange(option);
    return value[0].isSame(range[0]) && value[1].isSame(range[1]);
  });
  return <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
    <Segmented options={options} value={selectedOption ?? inferredOption} onChange={(selected) => { const option = String(selected); setSelectedOption(option); onChange(quickRange(option)); }} />
    <DatePicker.RangePicker value={value} onChange={(next) => { if (next?.[0] && next[1]) { setSelectedOption(''); onChange(next as RangeValue); } }} allowClear={false} />
  </div>;
}
