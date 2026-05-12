import { useEffect, useState } from "react";
import type { Location } from "../../lib/storage";
import {
  getLocations,
  setLocations,
  getTodos,
  setTodos,
  flush,
} from "../../lib/storage";
import { removeTagRefs } from "../../lib/todos";
import { TagListEditor } from "./TagListEditor";

type Props = { onClose: () => void };

/**
 * 위치 태그 편집 화면 (설계 §10).
 *
 * - 마운트 시 1회 store read → 편집기에 전달.
 * - 저장 (U-4 일괄): setLocations(save:false) + setTodos(removeTagRefs, save:false) + flush()
 *   → 디스크 I/O 1회로 묶음 (BR-5).
 * - maxItems 미지정 (무제한).
 */
export function LocationEditorScreen({ onClose }: Props) {
  const [items, setItems] = useState<Location[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const l = await getLocations();
        if (!cancelled) setItems(l);
      } catch (err) {
        console.error("[mohashim] getLocations failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (next: Location[], deletedIds: string[]) => {
    try {
      await setLocations(next, { save: false });
      if (deletedIds.length > 0) {
        const todos = await getTodos();
        const cleaned = removeTagRefs(todos, deletedIds, "loc");
        await setTodos(cleaned, { save: false });
      }
      await flush();
    } catch (err) {
      console.error("[mohashim] location save failed", err);
      throw err;
    }
  };

  if (!loaded) return null;

  return (
    <TagListEditor
      title="위치 태그 편집"
      items={items}
      kind="loc"
      maxItems={5}
      onSave={handleSave}
      onClose={onClose}
    />
  );
}
