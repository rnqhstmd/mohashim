import type { WorkTag, Location } from "../../lib/storage";
import { MetaChip } from "./MetaChip";
import { EmptyChip } from "./EmptyChip";

type TagPickerProps = {
  kind: "work" | "loc";
  items: readonly (WorkTag | Location)[];
  value: string | null;
  onChange: (id: string | null) => void;
};

/**
 * 가로 스크롤 칩 picker — 작업/위치 공용 (AC-27).
 * 첫 칩은 EmptyChip(value=null), 나머지는 MetaChip 배열.
 * 같은 칩 재클릭 시 선택 해제.
 */
export function TagPicker({ items, value, onChange }: TagPickerProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      <EmptyChip active={value === null} onClick={() => onChange(null)} />
      {items.map((t) => (
        <MetaChip
          key={t.id}
          tag={t}
          active={value === t.id}
          onClick={() => onChange(value === t.id ? null : t.id)}
        />
      ))}
    </div>
  );
}
