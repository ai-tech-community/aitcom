import type { EditorFormState, EditorAction, SlashMenuState, SlashMenuAction } from "./types";

export function editorReducer(state: EditorFormState, action: EditorAction): EditorFormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.payload };
    case "SET_ARTICLE_TYPE":
      return { ...state, type: action.payload };
    case "ADD_TAG":
      if (state.tags.includes(action.payload) || state.tags.length >= 10) return state;
      return { ...state, tags: [...state.tags, action.payload] };
    case "REMOVE_TAG":
      return { ...state, tags: state.tags.filter((t) => t !== action.payload) };
    case "SET_EDITOR_STATE":
      return { ...state, editorState: action.payload };
    case "SAVE_START":
      return { ...state, saving: true, saveState: "saving" };
    case "SAVE_SUCCESS":
      return { ...state, articleId: action.payload.articleId, lastSavedAt: action.payload.time, saveState: "saved" };
    case "SAVE_ERROR":
      return { ...state, saveState: "error" };
    case "SAVE_END":
      return { ...state, saving: false };
    case "SUBMIT_START":
      return { ...state, submitting: true };
    case "SUBMIT_END":
      return { ...state, submitting: false };
    case "MARK_UNSAVED":
      return { ...state, saveState: "unsaved" };
  }
}

export function slashMenuReducer(state: SlashMenuState, action: SlashMenuAction): SlashMenuState {
  switch (action.type) {
    case "OPEN":
      return { open: true, query: "", activeIndex: 0 };
    case "CLOSE":
      return { open: false, query: "", activeIndex: 0 };
    case "APPEND_QUERY":
      return { ...state, query: state.query + action.payload };
    case "BACKSPACE_QUERY":
      return { ...state, query: state.query.slice(0, -1) };
    case "SET_ACTIVE_INDEX":
      return { ...state, activeIndex: action.payload };
    case "MOVE_DOWN":
      return { ...state, activeIndex: action.payload === 0 ? 0 : (state.activeIndex + 1) % action.payload };
    case "MOVE_UP":
      return { ...state, activeIndex: action.payload === 0 ? 0 : state.activeIndex === 0 ? action.payload - 1 : state.activeIndex - 1 };
  }
}
