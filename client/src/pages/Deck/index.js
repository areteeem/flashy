import { useNavigate, useParams } from "react-router";
import styles from "./Deck.module.css";
import { toast } from "react-toastify";
import Card from "../../common/components/Card";
import Button from "../../common/components/Button";
import Badge from "../../common/components/Badge";
import LoadingScreen from "../../common/components/LoadingScreen";
import EditCardModal from "./EditCardModal";
import AddCardTabs from "./AddCardTabs";
import { useState, useEffect, useCallback, useRef } from "react";
import RetentionBadge from "./RetentionBadge";
import { useDeck, useDeleteDeck, useDeleteCard, useUpdateDeck, useStudents, useCourses, useCourseActions, useCreateDeck, useCreateCardsBulk } from "../../hooks/useSupabaseData";
import { useSettings } from "../../contexts/SettingsContext";
import { useAuth } from "../../contexts/AuthContext";
import { getSessionProgress } from "../../lib/studySession";
import ConfirmModal from "../../common/components/ConfirmModal";
import PromptModal from "../../common/components/PromptModal";
import ManageDeckCoursesModal from "../../common/components/ManageDeckCoursesModal";
import BulkAssignModal from "../Teacher/BulkAssignModal";
import ContextMenu from "../../common/components/ContextMenu";
import dayjs from "dayjs";

const stripHtmlTags = (html) => (html || "").replace(/<[^>]*>/g, "").trim();

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const exportDeckCsv = (deckName, flashcards) => {
  const escape = (v) => {
    const s = stripHtmlTags(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const rows = [
    "Term,Definition,Example,Type",
    ...flashcards.map((c) =>
      `${escape(c.front)},${escape(c.back)},${escape(c.example_sentence)},${c.card_type || "normal"}`
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${stripHtmlTags(deckName) || "deck"}.csv`);
};

const exportDeckJson = (deckName, flashcards) => {
  const cards = flashcards.map((c) => ({
    front: stripHtmlTags(c.front),
    back: stripHtmlTags(c.back),
    example_sentence: stripHtmlTags(c.example_sentence),
    ...(c.card_type && c.card_type !== "normal" ? { card_type: c.card_type } : {}),
  }));
  const json = JSON.stringify({ name: stripHtmlTags(deckName), cards }, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  triggerDownload(blob, `${stripHtmlTags(deckName) || "deck"}.json`);
};

const Deck = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editFlashcard, setEditFlashcard] = useState({
    front: "",
    back: "",
    id: "",
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCards, setSelectedCards] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteDeck, setConfirmDeleteDeck] = useState(false);
  const [showRenamePrompt, setShowRenamePrompt] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [useOverflowMenu, setUseOverflowMenu] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [overflowMenuPos, setOverflowMenuPos] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportMenuPos, setExportMenuPos] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const exportMenuRef = useRef(null);
  const exportBtnRef = useRef(null);
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const titleRef = useRef(null);
  const actionsRef = useRef(null);
  const actionsMeasureRef = useRef(null);
  const overflowMenuRef = useRef(null);
  const overflowBtnRef = useRef(null);
  const params = useParams();
  const { data: deck, loading, refetch } = useDeck(params.id);
  const { deleteDeck, loading: deleting } = useDeleteDeck();
  const { deleteCard } = useDeleteCard();
  const { updateDeck } = useUpdateDeck();
  const { courses, refetch: refetchCourses } = useCourses();
  const { addDeckToCourse, removeDeckFromCourse } = useCourseActions();
  const { t } = useSettings();
  const { isTeacher } = useAuth();
  const { data: students } = useStudents();
  const { createDeck } = useCreateDeck();
  const { createCardsBulk } = useCreateCardsBulk();

  // Compute fixed position for dropdown menus relative to a trigger button
  const getMenuPos = useCallback((btnRef) => {
    if (!btnRef?.current) return { top: 0, right: 0 };
    const rect = btnRef.current.getBoundingClientRect();
    let top = rect.bottom + 6;
    let right = window.innerWidth - rect.right;
    if (right < 0) right = 4;
    if (top + 320 > window.innerHeight) top = Math.max(4, rect.top - 320);
    return { top, right };
  }, []);

  const deckCourseCount = (courses || []).filter((course) =>
    (course.flashy_course_decks || []).some((entry) => String(entry.deck_id) === String(params.id))
  ).length;

  const flashcards = deck?.flashcards || [];
  const deckCardsRetention = flashcards.reduce((acc, curr) => acc + (curr.retention || 0), 0);
  const deckReviews = flashcards.reduce((acc, curr) => acc + (curr.reviews || 0), 0);
  const deckRetention = deckReviews > 0 ? Math.round((deckCardsRetention / deckReviews) * 100) : 0;
  const newCards = flashcards.filter((card) => card.is_new === true).length;
  const dueCards = flashcards.filter((card) => new Date(card.due) < new Date() && card.is_new === false).length;
  const hardCards = flashcards.filter(
    (card) => (card.again_count || 0) >= 3 || (card.ease_factor && card.ease_factor < 2.0)
  ).length;
  const avgReviews = flashcards.length > 0 ? (deckReviews / flashcards.length).toFixed(1) : 0;
  const avgEase = flashcards.filter((c) => c.ease_factor).length > 0
    ? (flashcards.reduce((s, c) => s + (c.ease_factor || 0), 0) / flashcards.filter((c) => c.ease_factor).length).toFixed(2)
    : "—";
  const hardestCards = [...flashcards]
    .filter((c) => (c.again_count || 0) > 0)
    .sort((a, b) => (b.again_count || 0) - (a.again_count || 0))
    .slice(0, 5);
  const [showStats, setShowStats] = useState(false);
  const nextSortOrder = flashcards.reduce(
    (highest, card, index) => Math.max(highest, card.sort_order ?? index),
    -1
  ) + 1;
  const sessionProgress = getSessionProgress(params.id);
  const isContinuingSession = sessionProgress !== null && sessionProgress < 100;

  const toggleCard = (cardId) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const selectAll = () => {
    if (deck) setSelectedCards(new Set(deck.flashcards.map((c) => c.id)));
  };

  const deselectAll = () => setSelectedCards(new Set());

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) setSelectedCards(new Set());
      return !prev;
    });
  }, []);

  const handleBulkDelete = async () => {
    if (selectedCards.size === 0) return;
    setConfirmBulkDelete(true);
  };

  const doBulkDelete = async () => {
    setConfirmBulkDelete(false);
    setBulkDeleting(true);
    try {
      for (const id of selectedCards) {
        await deleteCard(id);
      }
      toast.success(`Deleted ${selectedCards.size} card(s)`);
      setSelectedCards(new Set());
      setSelectionMode(false);
      refetch();
    } catch (err) {
      toast.error(err.message || "Failed to delete some cards");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteDeck = async () => {
    if (!deck) return;
    setConfirmDeleteDeck(true);
  };

  const doDeleteDeck = async () => {
    setConfirmDeleteDeck(false);
    try {
      await deleteDeck(params.id);
      toast.success("Deck deleted");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.message || "Failed to delete deck");
    }
  };

  const handleArchiveDeck = async () => {
    if (!deck) return;
    try {
      await updateDeck(params.id, { is_archived: true });
      toast.success("Deck archived");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.message || "Failed to archive deck");
    }
  };

  const handleDuplicateDeck = async () => {
    if (!deck) return;
    try {
      const newDeck = await createDeck({ name: `${deck.name} (copy)` });
      if (flashcards.length > 0) {
        const cards = flashcards.map((c) => ({
          deck_id: newDeck.id,
          front: c.front,
          back: c.back,
          example_sentence: c.example_sentence || null,
          card_type: c.card_type || "normal",
          sort_order: c.sort_order ?? 0,
        }));
        await createCardsBulk(cards);
      }
      toast.success("Deck duplicated");
      navigate(`/deck/${newDeck.id}`);
    } catch (err) {
      toast.error(err.message || "Failed to duplicate deck");
    }
  };

  const handleShareDeck = async () => {
    if (!deck) return;
    try {
      let token = deck.share_token;
      if (!token) {
        // Generate a new share token
        token = crypto.randomUUID ? crypto.randomUUID() : (`${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await updateDeck(params.id, { share_token: token });
        refetch();
      }
      const shareUrl = new URL(
        `shared/${token}`,
        `${window.location.origin}${import.meta.env.BASE_URL}`,
      ).toString();
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard!");
    } catch (err) {
      toast.error(err.message || "Failed to generate share link");
    }
  };

  const handleUnshare = async () => {
    if (!deck) return;
    try {
      await updateDeck(params.id, { share_token: null });
      refetch();
      toast.success("Share link removed");
    } catch (err) {
      toast.error(err.message || "Failed to remove share link");
    }
  };

  const handleRenameDeck = () => {
    if (!deck) return;
    setShowRenamePrompt(true);
  };

  const doRenameDeck = async (nextName) => {
    setShowRenamePrompt(false);
    const current = String(deck?.name || "").trim();
    const trimmed = String(nextName).trim();
    if (!trimmed || trimmed === current) return;
    try {
      await updateDeck(params.id, { name: trimmed });
      toast.success("Deck renamed");
      refetch();
    } catch (err) {
      toast.error(err.message || "Failed to rename deck");
    }
  };

  const handleAddDeckToCourse = async (course) => {
    try {
      await addDeckToCourse(course.id, params.id);
      toast.success(`Added to "${course.name}"`);
      refetchCourses();
    } catch (err) {
      toast.error(err.message || "Failed to add deck to course");
    }
  };

  const handleRemoveDeckFromCourse = async (course) => {
    try {
      await removeDeckFromCourse(course.id, params.id);
      toast.success(`Removed from "${course.name}"`);
      refetchCourses();
    } catch (err) {
      toast.error(err.message || "Failed to remove deck from course");
    }
  };

  // ── Keyboard shortcuts for study actions ──
  const handleKeyboard = useCallback(
    (e) => {
      // Ignore when user is typing in an input/textarea/contenteditable
      const tag = e.target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        e.target.isContentEditable ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;

      switch (e.key.toLowerCase()) {
        case "s":
          if (selectionMode) return;
          e.preventDefault();
          navigate("study");
          break;
        case "n":
          if (selectionMode) return;
          e.preventDefault();
          navigate("new");
          break;
        case "d":
          if (selectionMode) return;
          e.preventDefault();
          navigate("due");
          break;
        case "v":
          e.preventDefault();
          setViewMode((m) => (m === "grid" ? "table" : "grid"));
          break;
        case "escape":
          if (selectionMode) {
            e.preventDefault();
            toggleSelectionMode();
          }
          break;
        default:
          break;
      }
    },
    [navigate, selectionMode, toggleSelectionMode]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [handleKeyboard]);
  useEffect(() => {
    if (deck?.name) {
      document.title = `${deck.name} | TutPro`;
      return () => { document.title = 'Flashcards | TutPro'; };
    }
  }, [deck?.name]);

  useEffect(() => {
    if (!actionsRef.current || !actionsMeasureRef.current || !menuRef.current || !titleRef.current) return undefined;

    const evaluateToolbar = () => {
      const availableWidth = actionsRef.current?.clientWidth || 0;
      const requiredWidth = actionsMeasureRef.current?.scrollWidth || 0;
      const menuWidth = menuRef.current?.clientWidth || 0;
      const titleWidth = titleRef.current?.scrollWidth || 0;
      if (!requiredWidth) return;

      const needsCompactBecauseActionsOverflow = availableWidth > 0 && requiredWidth > availableWidth + 8;
      const needsCompactBecauseHeaderWraps = menuWidth > 0 && titleWidth > 0 && (titleWidth + requiredWidth + 32) > menuWidth;
      const needsCompactBecauseViewportIsTight = menuWidth > 0 && menuWidth < 780;

      setUseOverflowMenu(
        needsCompactBecauseActionsOverflow
        || needsCompactBecauseHeaderWraps
        || needsCompactBecauseViewportIsTight
      );
    };

    evaluateToolbar();
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => evaluateToolbar())
      : null;

    if (resizeObserver) {
      resizeObserver.observe(actionsRef.current);
      resizeObserver.observe(actionsMeasureRef.current);
    }

    window.addEventListener("resize", evaluateToolbar);
    return () => {
      window.removeEventListener("resize", evaluateToolbar);
      resizeObserver?.disconnect();
    };
  }, [deck?.id, deck?.name, deckRetention, flashcards.length, hardCards, isTeacher, isContinuingSession, deckCourseCount, newCards, dueCards, selectionMode, sessionProgress, viewMode]);

  useEffect(() => {
    if (!useOverflowMenu) setShowOverflowMenu(false);
  }, [useOverflowMenu]);

  useEffect(() => {
    if (!showOverflowMenu) return undefined;

    const handleClickOutside = (event) => {
      if (!overflowMenuRef.current?.contains(event.target)) {
        setShowOverflowMenu(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowOverflowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showOverflowMenu]);

  useEffect(() => {
    if (!showExportMenu) return undefined;
    const handleClickOutside = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) setShowExportMenu(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showExportMenu]);


  if (loading) return <LoadingScreen />;
  if (deck) {
    const closeOverflowMenu = () => setShowOverflowMenu(false);

    const renderSelectionToggle = () => (
      <button
        className={`${styles.viewToggle} ${selectionMode ? styles.viewToggleActive : ""}`}
        onClick={toggleSelectionMode}
        title={selectionMode ? "Exit selection" : "Select cards"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      </button>
    );

    const renderFullActionButtons = () => (
      <>
        <button
          className={styles.addToggle}
          onClick={() => setShowAddPanel((p) => !p)}
          title={t("addCard")}
        >
          {showAddPanel ? "−" : "+"}
        </button>
        {isContinuingSession && (
          <Button
            callback={() => navigate("study")}
            bgcolor="var(--fg)"
            color="var(--bg)"
          >
            ▶ {t("continueStudy")} {sessionProgress}%
          </Button>
        )}
        <Button callback={() => navigate("study")} title="S">
          {t("study")}
        </Button>
        <Button callback={() => navigate("new")} title="N">
          {t("learnNewBtn")} <Badge style={{ fontSize: "0.7em" }}>{newCards}</Badge>
        </Button>
        <Button callback={() => navigate("due")} title="D">
          {t("studyDue")} <Badge style={{ fontSize: "0.7em" }}>{dueCards}</Badge>
        </Button>
        {hardCards > 0 && (
          <Button callback={() => navigate("study?pool=hard")}>
            {t("hard")} <Badge style={{ fontSize: "0.7em" }}>{hardCards}</Badge>
          </Button>
        )}
        {isTeacher && (
          <button
            className={styles.viewToggle}
            onClick={() => setShowAssignModal(true)}
            title="Assign to students"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </button>
        )}
        {isTeacher && (
          <button
            className={`${styles.viewToggle} ${deckCourseCount > 0 ? styles.viewToggleActive : ""}`}
            onClick={() => setShowCourseModal(true)}
            title={deckCourseCount > 0 ? `Manage courses (${deckCourseCount})` : "Add to course"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
          </button>
        )}
        {renderSelectionToggle()}
        <button
          className={styles.viewToggle}
          onClick={() => setViewMode(viewMode === "grid" ? "table" : "grid")}
          title={viewMode === "grid" ? t("switchToTable") + " (V)" : t("switchToGrid") + " (V)"}
        >
          {viewMode === "grid"
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          }
        </button>
        <div className={styles.overflowWrap} ref={exportMenuRef}>
          <button
            ref={exportBtnRef}
            className={styles.viewToggle}
            onClick={() => {
              setShowExportMenu((p) => {
                if (!p) setExportMenuPos(getMenuPos(exportBtnRef));
                return !p;
              });
            }}
            title={t("exportDeck")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          {showExportMenu && (
            <div className={styles.overflowMenu} style={exportMenuPos ? { top: exportMenuPos.top, right: exportMenuPos.right } : undefined}>
              <button className={styles.overflowItem} onClick={() => { setShowExportMenu(false); exportDeckCsv(deck.name, deck.flashcards); }}>
                <span>Export CSV</span>
              </button>
              <button className={styles.overflowItem} onClick={() => { setShowExportMenu(false); exportDeckJson(deck.name, deck.flashcards); }}>
                <span>Export JSON</span>
              </button>
            </div>
          )}
        </div>
        <button
          className={styles.viewToggle}
          onClick={handleDuplicateDeck}
          title="Duplicate deck"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button
          className={styles.viewToggle}
          onClick={handleRenameDeck}
          title="Rename deck"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
        <button
          className={`${styles.viewToggle} ${deck.share_token ? styles.viewToggleActive : ""}`}
          onClick={deck.share_token ? handleUnshare : handleShareDeck}
          title={deck.share_token ? "Remove share link" : "Copy share link"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
        <button
          className={styles.viewToggle}
          onClick={handleArchiveDeck}
          title="Archive deck"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
        </button>
        <button
          className={styles.viewToggle}
          onClick={handleDeleteDeck}
          disabled={deleting}
          title="Delete deck"
          style={{ color: "var(--danger, #dc2626)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </>
    );

    const renderCompactActionButtons = () => (
      <>
        <button
          className={styles.addToggle}
          onClick={() => setShowAddPanel((p) => !p)}
          title={t("addCard")}
        >
          {showAddPanel ? "−" : "+"}
        </button>
        {isContinuingSession ? (
          <Button
            callback={() => navigate("study")}
            bgcolor="var(--fg)"
            color="var(--bg)"
          >
            ▶ {sessionProgress}%
          </Button>
        ) : (
          <Button callback={() => navigate("study")} title="S">
            {t("study")}
          </Button>
        )}
        {selectionMode && renderSelectionToggle()}
        <div className={styles.overflowWrap} ref={overflowMenuRef}>
          <button
            ref={overflowBtnRef}
            className={`${styles.viewToggle} ${showOverflowMenu ? styles.viewToggleActive : ""}`}
            onClick={() => {
              setShowOverflowMenu((prev) => {
                if (!prev) setOverflowMenuPos(getMenuPos(overflowBtnRef));
                return !prev;
              });
            }}
            title="More actions"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
          {showOverflowMenu && (
            <div className={styles.overflowMenu} style={overflowMenuPos ? { top: overflowMenuPos.top, right: overflowMenuPos.right } : undefined}>
              {isContinuingSession && (
                <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); navigate("study"); }}>
                  <span>{t("study")}</span>
                </button>
              )}
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); navigate("new"); }}>
                <span>{t("learnNewBtn")}</span>
                <Badge>{newCards}</Badge>
              </button>
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); navigate("due"); }}>
                <span>{t("studyDue")}</span>
                <Badge>{dueCards}</Badge>
              </button>
              {hardCards > 0 && (
                <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); navigate("study?pool=hard"); }}>
                  <span>{t("hard")}</span>
                  <Badge>{hardCards}</Badge>
                </button>
              )}
              {isTeacher && (
                <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); setShowAssignModal(true); }}>
                  <span>Assign to students</span>
                </button>
              )}
              {isTeacher && (
                <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); setShowCourseModal(true); }}>
                  <span>{deckCourseCount > 0 ? "Manage courses" : "Add to course"}</span>
                  {deckCourseCount > 0 ? <Badge>{deckCourseCount}</Badge> : null}
                </button>
              )}
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); toggleSelectionMode(); }}>
                <span>{selectionMode ? "Exit selection" : "Select cards"}</span>
              </button>
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); setViewMode(viewMode === "grid" ? "table" : "grid"); }}>
                <span>{viewMode === "grid" ? t("switchToTable") : t("switchToGrid")}</span>
              </button>
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); exportDeckCsv(deck.name, deck.flashcards); }}>
                <span>Export CSV</span>
              </button>
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); exportDeckJson(deck.name, deck.flashcards); }}>
                <span>Export JSON</span>
              </button>
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); handleDuplicateDeck(); }}>
                <span>Duplicate deck</span>
              </button>
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); handleRenameDeck(); }}>
                <span>Rename deck</span>
              </button>
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); if (deck.share_token) handleUnshare(); else handleShareDeck(); }}>
                <span>{deck.share_token ? "Remove share link" : "Copy share link"}</span>
              </button>
              <button className={styles.overflowItem} onClick={() => { closeOverflowMenu(); handleArchiveDeck(); }}>
                <span>Archive deck</span>
              </button>
              <button className={`${styles.overflowItem} ${styles.overflowDanger}`} onClick={() => { closeOverflowMenu(); handleDeleteDeck(); }}>
                <span>Delete deck</span>
              </button>
            </div>
          )}
        </div>
      </>
    );

    return (
      <>
        <EditCardModal
          flashcard={editFlashcard}
          open={isModalOpen}
          setOpen={setIsModalOpen}
          deckId={params.id}
          onSaved={refetch}
        />
        <div className={styles.menu} ref={menuRef}>
          <h1 className={styles.title} ref={titleRef}>
            {deck.name}
            {deckRetention > 0 ? (
              <RetentionBadge retention={deckRetention}>
                {" "}
                {t("retention")}
              </RetentionBadge>
            ) : null}
            <Badge>{deck.flashcards.length} {t("cards")}</Badge>
          </h1>
          <div ref={actionsMeasureRef} className={styles.actionsMeasure} aria-hidden="true">
            {renderFullActionButtons()}
          </div>
          <div ref={actionsRef} className={`${styles.actions} ${useOverflowMenu ? styles.actionsCompact : ""}`}>
            {useOverflowMenu ? renderCompactActionButtons() : renderFullActionButtons()}
          </div>
        </div>
        <AddCardTabs deckId={params.id} onChanged={refetch} startSortOrder={nextSortOrder} show={showAddPanel} />
        {isTeacher && flashcards.length > 0 && (
          <div className={styles.statsPanel}>
            <button className={styles.statsToggle} onClick={() => setShowStats((s) => !s)}>
              {showStats ? "▾" : "▸"} Deck analytics
            </button>
            {showStats && (
              <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{deckRetention}%</span>
                  <span className={styles.statLabel}>retention</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{avgReviews}</span>
                  <span className={styles.statLabel}>avg reviews</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{avgEase}</span>
                  <span className={styles.statLabel}>avg ease</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{newCards}</span>
                  <span className={styles.statLabel}>new</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{dueCards}</span>
                  <span className={styles.statLabel}>due</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue} style={hardCards > 0 ? { color: "var(--danger)" } : {}}>{hardCards}</span>
                  <span className={styles.statLabel}>hard</span>
                </div>
                {hardestCards.length > 0 && (
                  <div className={styles.statHardest}>
                    <span className={styles.statLabel}>Most mistakes</span>
                    <div className={styles.hardestList}>
                      {hardestCards.map((c) => (
                        <span
                          key={c.id}
                          className={styles.hardestItem}
                          onClick={() => { setEditFlashcard(c); setIsModalOpen(true); }}
                        >
                          {stripHtmlTags(c.front).slice(0, 30)}{stripHtmlTags(c.front).length > 30 ? "…" : ""} ({c.again_count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {selectionMode && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkCount}>{selectedCards.size} selected</span>
            <button className={styles.bulkBtn} onClick={selectedCards.size === deck.flashcards.length ? deselectAll : selectAll}>
              {selectedCards.size === deck.flashcards.length ? t("deselectAll") || "Deselect all" : t("selectAll") || "Select all"}
            </button>
            {selectedCards.size > 0 && (
              <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? "Deleting…" : `Delete ${selectedCards.size}`}
              </button>
            )}
            <button className={styles.bulkBtn} onClick={toggleSelectionMode}>×</button>
          </div>
        )}
        {viewMode === "grid" ? (
          <div className={styles.flashcardContainer}>
            {deck.flashcards.map((flashcard) => (
              <div
                key={flashcard.id}
                className={`${styles.cardWrapper} ${selectionMode && selectedCards.has(flashcard.id) ? styles.cardSelected : ""}`}
                onClick={() => {
                  if (selectionMode) {
                    toggleCard(flashcard.id);
                  } else {
                    setEditFlashcard(flashcard);
                    setIsModalOpen(true);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: "Edit card", onClick: () => { setEditFlashcard(flashcard); setIsModalOpen(true); } },
                      { label: "Copy front text", onClick: () => { navigator.clipboard.writeText(stripHtmlTags(flashcard.front)); toast.success("Copied"); } },
                      { label: "Copy back text", onClick: () => { navigator.clipboard.writeText(stripHtmlTags(flashcard.back)); toast.success("Copied"); } },
                      { separator: true },
                      { label: "Delete card", danger: true, onClick: async () => { await deleteCard(flashcard.id); refetch(); toast.success("Card deleted"); } },
                    ],
                  });
                }}
              >
                {selectionMode && (
                  <input
                    type="checkbox"
                    className={styles.cardCheckbox}
                    checked={selectedCards.has(flashcard.id)}
                    onChange={() => toggleCard(flashcard.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <Card flashcard={flashcard} />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.tableView}>
            <div className={styles.tableHeader}>
              {selectionMode && <span className={styles.tableCheckCol} />}
              <span className={styles.tableRowTerm}>{t("term")}</span>
              <span className={styles.tableRowDef}>{t("definition")}</span>
              <span className={styles.tableRowDue}>{t("dueColumn")}</span>
            </div>
            {deck.flashcards.map((flashcard) => {
              const due = flashcard.due ? dayjs(flashcard.due) : null;
              const isOverdue = due && due.isBefore(dayjs());
              return (
                <div
                  key={flashcard.id}
                  className={`${styles.tableRow} ${selectionMode && selectedCards.has(flashcard.id) ? styles.tableRowSelected : ""}`}
                  onClick={() => {
                    if (selectionMode) {
                      toggleCard(flashcard.id);
                    } else {
                      setEditFlashcard(flashcard);
                      setIsModalOpen(true);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({
                      x: e.clientX,
                      y: e.clientY,
                      items: [
                        { label: "Edit card", onClick: () => { setEditFlashcard(flashcard); setIsModalOpen(true); } },
                        { label: "Copy front text", onClick: () => { navigator.clipboard.writeText(stripHtmlTags(flashcard.front)); toast.success("Copied"); } },
                        { label: "Copy back text", onClick: () => { navigator.clipboard.writeText(stripHtmlTags(flashcard.back)); toast.success("Copied"); } },
                        { separator: true },
                        { label: "Delete card", danger: true, onClick: async () => { await deleteCard(flashcard.id); refetch(); toast.success("Card deleted"); } },
                      ],
                    });
                  }}
                >
                  {selectionMode && (
                    <input
                      type="checkbox"
                      className={styles.tableCheckbox}
                      checked={selectedCards.has(flashcard.id)}
                      onChange={() => toggleCard(flashcard.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <span className={styles.tableRowTerm}>{flashcard.front}</span>
                  <span className={styles.tableRowDef}>{flashcard.back}</span>
                  <span className={`${styles.tableRowDue} ${isOverdue ? styles.overdue : ""}`}>
                    {flashcard.is_new ? t("newBadge") : due ? due.fromNow() : t("neverStudied")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <ConfirmModal
          open={confirmBulkDelete}
          title="Delete cards"
          message={`Delete ${selectedCards.size} card(s)? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          details={(() => {
            const sel = flashcards.filter(c => selectedCards.has(c.id));
            const preview = sel.slice(0, 5).map(c => stripHtmlTags(c.front) || '(no term)');
            if (sel.length > 5) preview.push(`...and ${sel.length - 5} more`);
            return [`Cards: ${preview.join(', ')}`, 'All study progress for these cards will be lost'];
          })()}
          requireType={selectedCards.size >= 20 ? 'DELETE' : undefined}
          onConfirm={doBulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
        <ConfirmModal
          open={confirmDeleteDeck}
          title="Delete deck"
          message={`Delete "${deck?.name}" and all its cards? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          details={[
            `${flashcards.length} card(s) and all study progress will be permanently deleted`,
            'The deck will be removed from all courses'
          ]}
          requireType="DELETE"
          onConfirm={doDeleteDeck}
          onCancel={() => setConfirmDeleteDeck(false)}
        />
        <PromptModal
          open={showRenamePrompt}
          title="Rename deck"
          message="New deck name"
          defaultValue={deck?.name || ""}
          onSubmit={doRenameDeck}
          onCancel={() => setShowRenamePrompt(false)}
        />
        {isTeacher && (
          <BulkAssignModal
            open={showAssignModal}
            setOpen={setShowAssignModal}
            students={students}
            initialDeckId={params.id}
          />
        )}
        {isTeacher && (
          <ManageDeckCoursesModal
            open={showCourseModal}
            setOpen={setShowCourseModal}
            deck={deck}
            courses={courses}
            onAdd={handleAddDeckToCourse}
            onRemove={handleRemoveDeckFromCourse}
            onOpenDashboard={() => navigate("/")}
          />
        )}
        {ctxMenu && (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={ctxMenu.items}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </>
    );
  } else {
    toast.error(t("deckNotFound"));
    return <h1>{t("error")}</h1>;
  }
};

export default Deck;
