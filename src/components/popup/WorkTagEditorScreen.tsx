import { useEffect, useState } from "react";
import type { WorkTag } from "../../lib/storage";
import {
  getWorkTags,
  setWorkTags,
  getTodos,
  setTodos,
  flush,
} from "../../lib/storage";
import { removeTagRefs } from "../../lib/todos";
import { TagListEditor } from "./TagListEditor";

type Props = { onClose: () => void };

/**
 * 작업 태그 편집 화면 (Phase 21 사용자 피드백 반영).
 *
 * Phase 18 FR-C1~C6에서 SettingsScreen 인라인으로 처리하던 작업 태그를 위치 태그처럼
 * 별도 페이지에서 편집하도록 분리. LocationEditorScreen과 동일 패턴 — TagListEditor
 * 컴포넌트를 kind="work"로 래핑.
 *
 * 저장 (U-4 일괄):
 *   - setWorkTags(save:false) + setTodos(removeTagRefs, save:false) + flush()
 *   - 디스크 I/O 1회로 묶음.
 *   - 작업 태그 1개 이상 보장 (TagListEditor 내부 BR-7).
 *
 * maxItems=5 (작업 태그는 최대 5개).
 */
export function WorkTagEditorScreen({ onClose }: Props) {
  const [items, setItems] = useState<WorkTag[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await getWorkTags();
        if (!cancelled) setItems(w);
      } catch (err) {
        console.error("[mohashim] getWorkTags failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (next: WorkTag[], deletedIds: string[]) => {
    try {
      await setWorkTags(next, { save: false });
      if (deletedIds.length > 0) {
        const todos = await getTodos();
        const cleaned = removeTagRefs(todos, deletedIds, "work");
        await setTodos(cleaned, { save: false });
      }
      await flush();
    } catch (err) {
      console.error("[mohashim] work tag save failed", err);
      throw err;
    }
  };

  if (!loaded) return null;

  return (
    <TagListEditor
      title="작업 태그 편집"
      items={items}
      kind="work"
      maxItems={5}
      onSave={handleSave}
      onClose={onClose}
    />
  );
}
