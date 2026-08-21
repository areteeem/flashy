import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Badge from "../../common/components/Badge";
import Button from "../../common/components/Button";
import LoadingScreen from "../../common/components/LoadingScreen";
import Modal from "../../common/components/Modal";
import TextInput from "../../common/components/TextInput";
import { useAuth } from "../../contexts/AuthContext";
import {
  useAssignDeck,
  useAssignments,
  useDecks,
  useLogActivity,
  useRecentActivity,
  useStudents,
  useTutproRoster,
} from "../../hooks/useSupabaseData";
import { supabase } from "../../lib/supabaseClient";
import {
  buildStudentAppLaunchUrl,
  getProfileTutproStudentId,
  normalizeStudentName,
} from "../../lib/tutproRoster";
import BulkAssignModal from "./BulkAssignModal";
import styles from "./Teacher.module.css";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const ASSIGN_SINGLE_SETTINGS_KEY = "flashy_assign_single_settings";
const ASSIGN_RECENT_DECKS_KEY = "flashy_assign_recent_deck_ids";
const STICKY_NEXT_STUDENT_KEY = "flashy_assign_next_student_sticky";
const MAX_RECENT_DECKS = 5;
const DUE_SOON_DAYS = 3;

const ASSIGNMENT_TEMPLATES = [
  {
    id: "exam-prep",
    label: "Exam prep",
    requiredPool: "mixed",
    requiredMode: "quiz",
    addToPersonalLibrary: false,
  },
  {
    id: "vocabulary-sprint",
    label: "Vocabulary sprint",
    requiredPool: "new",
    requiredMode: "flashcards",
    addToPersonalLibrary: true,
  },
  {
    id: "revision-only",
    label: "Revision-only",
    requiredPool: "due",
    requiredMode: "mcq",
    addToPersonalLibrary: false,
  },
];

const ACTION_LABELS = {
  deck_assigned: "Assigned deck",
  deck_assign_duplicate: "Duplicate assign",
  copy_login_link: "Copied login link",
  copy_profile_link: "Copied profile link",
  copy_student_bundle: "Copied student bundle",
  reminder_prepared: "Prepared reminder",
  open_student_app: "Opened student app",
  open_student_progress: "Opened progress",
};

const loadSingleAssignSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(ASSIGN_SINGLE_SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
};

const saveSingleAssignSettings = (settings) => {
  try {
    localStorage.setItem(ASSIGN_SINGLE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage failures
  }
};

const loadRecentDeckIds = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(ASSIGN_RECENT_DECKS_KEY));
    if (!Array.isArray(raw)) return [];
    return raw.map((value) => String(value || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
};

const pushRecentDeckId = (deckId) => {
  const normalizedDeckId = String(deckId || "").trim();
  if (!normalizedDeckId) return loadRecentDeckIds();
  const next = [
    normalizedDeckId,
    ...loadRecentDeckIds().filter((entry) => entry !== normalizedDeckId),
  ].slice(0, MAX_RECENT_DECKS);
  try {
    localStorage.setItem(ASSIGN_RECENT_DECKS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
  return next;
};

const copyText = async (text) => {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  }
};

const formatRelativeTime = (value) => {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return "";
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
};

const getStudentLoginUrl = (profile, teacherId) => {
  const resolvedTeacherId = String(profile?.teacher_id || teacherId || "").trim();
  const studentId = getProfileTutproStudentId(profile);
  const studentName = String(profile?.display_name || profile?.email || "").trim();

  if (!resolvedTeacherId || !studentId || !studentName) return null;

  return buildStudentAppLaunchUrl({
    baseUrl: `${window.location.origin}${import.meta.env.BASE_URL}`,
    teacherId: resolvedTeacherId,
    studentId,
    studentName,
  });
};

const getStudentProfileUrl = (profile) => {
  const profileId = String(profile?.id || "").trim();
  if (!profileId) return null;
  return new URL(`students/${encodeURIComponent(profileId)}`, `${window.location.origin}${import.meta.env.BASE_URL}`).toString();
};

const buildStudentAssignmentSummaryMap = (assignments = []) => {
  const map = new Map();
  const now = Date.now();
  const dueSoonTs = now + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;

  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    const studentId = String(assignment?.student_id || "").trim();
    if (!studentId) return;

    const current = map.get(studentId) || {
      total: 0,
      overdue: 0,
      dueSoon: 0,
      progressSum: 0,
      avgProgress: 0,
      risk: "low",
      riskLabel: "Low risk",
      deckNames: [],
    };

    current.total += 1;

    const deckName = String(assignment?.custom_name || "").trim()
      || String(assignment?.flashy_decks?.name || "").trim();
    if (deckName) current.deckNames.push(deckName);

    const rawProgress = Number(assignment?.progress_percent);
    const completed = assignment?.completed === true || rawProgress >= 100;
    const normalizedProgress = Number.isFinite(rawProgress)
      ? Math.max(0, Math.min(100, rawProgress))
      : (completed ? 100 : 0);
    current.progressSum += normalizedProgress;

    const deadlineTs = Date.parse(String(assignment?.deadline || ""));
    if (!completed && Number.isFinite(deadlineTs)) {
      if (deadlineTs < now) current.overdue += 1;
      else if (deadlineTs <= dueSoonTs) current.dueSoon += 1;
    }

    map.set(studentId, current);
  });

  map.forEach((summary) => {
    summary.avgProgress = summary.total > 0
      ? Math.round(summary.progressSum / summary.total)
      : 0;

    if (summary.overdue > 0) {
      summary.risk = "high";
      summary.riskLabel = "High risk";
    } else if (summary.dueSoon > 0 || (summary.total >= 3 && summary.avgProgress < 40)) {
      summary.risk = "medium";
      summary.riskLabel = "Medium risk";
    } else {
      summary.risk = "low";
      summary.riskLabel = "Low risk";
    }

    summary.deckNames = [...new Set(summary.deckNames)].slice(0, 8);
  });

  return map;
};

const buildStudentRows = (rosterStudents = [], linkedStudents = []) => {
  const claimedLinkedIds = new Set();
  const tutproIdMap = new Map();
  const emailMap = new Map();
  const nameMap = new Map();

  linkedStudents.forEach((student) => {
    const tutproStudentId = getProfileTutproStudentId(student);
    if (tutproStudentId) {
      tutproIdMap.set(tutproStudentId, student);
    }

    const emailKey = normalizeEmail(student.email);
    if (emailKey) {
      emailMap.set(emailKey, [...(emailMap.get(emailKey) || []), student]);
    }

    const nameKey = normalizeStudentName(student.display_name || student.email);
    if (nameKey) {
      nameMap.set(nameKey, [...(nameMap.get(nameKey) || []), student]);
    }
  });

  const tutproRows = rosterStudents.map((student) => {
    let linkedProfile = null;

    if (student.tutproStudentId && tutproIdMap.has(student.tutproStudentId)) {
      const match = tutproIdMap.get(student.tutproStudentId);
      if (!claimedLinkedIds.has(match.id)) {
        linkedProfile = match;
      }
    }

    if (!linkedProfile && student.email) {
      const matches = (emailMap.get(normalizeEmail(student.email)) || [])
        .filter((candidate) => !claimedLinkedIds.has(candidate.id));
      if (matches.length === 1) {
        linkedProfile = matches[0];
      }
    }

    if (!linkedProfile && student.name) {
      const matches = (nameMap.get(normalizeStudentName(student.name)) || [])
        .filter((candidate) => !claimedLinkedIds.has(candidate.id));
      if (matches.length === 1) {
        linkedProfile = matches[0];
      }
    }

    if (linkedProfile) {
      claimedLinkedIds.add(linkedProfile.id);
    }

    return {
      key: `tutpro-${student.tutproStudentId || student.email || student.name}`,
      source: "tutpro",
      status: linkedProfile ? "linked" : "needs-launch",
      rosterStudent: student,
      linkedProfile,
      displayName: student.name || linkedProfile?.display_name || linkedProfile?.email || "Student",
      email: student.email || linkedProfile?.email || "",
    };
  });

  const flashyOnlyRows = linkedStudents
    .filter((student) => !claimedLinkedIds.has(student.id))
    .map((student) => ({
      key: `flashy-${student.id}`,
      source: "flashy",
      status: "linked",
      rosterStudent: null,
      linkedProfile: student,
      displayName: student.display_name || student.email || "Student",
      email: student.email || "",
    }));

  return [...tutproRows, ...flashyOnlyRows].sort((left, right) => (
    left.displayName.localeCompare(right.displayName)
  ));
};

const AddStudentModal = ({ open, setOpen, onAdded }) => {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.rpc("flashy_claim_student", {
        student_email: normalizedEmail,
        student_display_name: displayName.trim() || null,
      });

      if (error) throw error;

      toast.success(`Student ${normalizedEmail} linked to your profile.`);
      setEmail("");
      setDisplayName("");
      setOpen(false);
      onAdded?.();
    } catch (err) {
      toast.error(err.message || "Failed to link student");
    }
    setLoading(false);
  };

  return (
    <Modal open={open} setOpen={setOpen}>
      <form onSubmit={handleAdd}>
      <h3>Link existing student account</h3>
      <p className={styles.helperText}>
        TutPro students sync automatically from your latest backup. Use this only if a student already created a DeckTrack account manually and you want to link it by email.
      </p>
      <TextInput label="Student email" placeholder="student@example.com" state={email} setState={setEmail} />
      <TextInput
        label="Display name"
        placeholder="Optional override"
        state={displayName}
        setState={setDisplayName}
      />
      <div className={styles.modalActions}>
        <Button callback={handleAdd} disabled={loading}>
          {loading ? "Linking..." : "Link student"}
        </Button>
      </div>
      </form>
    </Modal>
  );
};

const AssignDeckModal = ({
  open,
  setOpen,
  studentId,
  studentName,
  onAssigned,
  onAssignNextStudent,
  stickyAssignNext,
  setStickyAssignNext,
  onLogAction,
}) => {
  const { data: decks, loading } = useDecks();
  const { assignDeck } = useAssignDeck();

  const savedSettings = useMemo(() => loadSingleAssignSettings(), []);
  const [requiredPool, setRequiredPool] = useState(savedSettings.requiredPool || "any");
  const [requiredMode, setRequiredMode] = useState(savedSettings.requiredMode || "any");
  const [addToPersonalLibrary, setAddToPersonalLibrary] = useState(savedSettings.addToPersonalLibrary === true);
  const [queueMode, setQueueMode] = useState(false);
  const [closeAfterAssign, setCloseAfterAssign] = useState(savedSettings.closeAfterAssign === true);
  const [selectedDeckIds, setSelectedDeckIds] = useState(new Set());
  const [assignStatuses, setAssignStatuses] = useState({});
  const [assigningDeckIds, setAssigningDeckIds] = useState(new Set());
  const [queueAssigning, setQueueAssigning] = useState(false);
  const [deckSearch, setDeckSearch] = useState("");
  const [recentDeckIds, setRecentDeckIds] = useState(loadRecentDeckIds);

  useEffect(() => {
    saveSingleAssignSettings({
      requiredPool,
      requiredMode,
      addToPersonalLibrary,
      closeAfterAssign,
    });
  }, [addToPersonalLibrary, closeAfterAssign, requiredMode, requiredPool]);

  useEffect(() => {
    setAssignStatuses({});
    setAssigningDeckIds(new Set());
    setQueueAssigning(false);
  }, [studentId]);

  useEffect(() => {
    if (!open) {
      setAssignStatuses({});
      setAssigningDeckIds(new Set());
      setQueueAssigning(false);
    }
  }, [open]);

  const filteredDecks = useMemo(() => {
    const q = deckSearch.trim().toLowerCase();
    const list = Array.isArray(decks) ? decks : [];
    if (!q) return list;
    return list.filter((deck) => String(deck.name || "").toLowerCase().includes(q));
  }, [deckSearch, decks]);

  const recentDecks = useMemo(() => {
    const byId = new Map((decks || []).map((deck) => [String(deck.id), deck]));
    return recentDeckIds
      .map((deckId) => byId.get(String(deckId)))
      .filter(Boolean);
  }, [decks, recentDeckIds]);

  const setDeckStatus = useCallback((deckId, status) => {
    setAssignStatuses((prev) => ({ ...prev, [deckId]: status }));
  }, []);

  const tryMoveToNextStudent = useCallback(async () => {
    if (!stickyAssignNext || !onAssignNextStudent) return false;
    const moved = await Promise.resolve(onAssignNextStudent(studentId));
    if (!moved) {
      toast.info("No next student in current list.");
      return false;
    }
    return true;
  }, [onAssignNextStudent, stickyAssignNext, studentId]);

  const assignOneDeck = useCallback(async (deckId, { silent = false, notifyParent = true } = {}) => {
    const normalizedDeckId = String(deckId || "").trim();
    if (!normalizedDeckId || !studentId) return { status: "error" };

    if (assigningDeckIds.has(normalizedDeckId)) return { status: "busy" };

    setAssigningDeckIds((prev) => {
      const next = new Set(prev);
      next.add(normalizedDeckId);
      return next;
    });
    setDeckStatus(normalizedDeckId, "assigning");

    try {
      await assignDeck(normalizedDeckId, studentId, {
        requiredPool,
        requiredMode,
        addToPersonalLibrary,
      });

      setDeckStatus(normalizedDeckId, "assigned");
      setRecentDeckIds(pushRecentDeckId(normalizedDeckId));

      if (!silent) toast.success("Deck assigned!");
      if (notifyParent) onAssigned?.();
      await onLogAction?.("deck_assigned", studentId, {
        deckId: normalizedDeckId,
        requiredPool,
        requiredMode,
        addToPersonalLibrary,
      });
      return { status: "assigned" };
    } catch (err) {
      const message = String(err?.message || "");
      if (/duplicate/i.test(message)) {
        setDeckStatus(normalizedDeckId, "duplicate");
        if (!silent) toast.info("Deck already assigned to this student");
        await onLogAction?.("deck_assign_duplicate", studentId, { deckId: normalizedDeckId });
        return { status: "duplicate" };
      }

      setDeckStatus(normalizedDeckId, "error");
      if (!silent) toast.error(message || "Failed to assign deck");
      await onLogAction?.("deck_assign_failed", studentId, {
        deckId: normalizedDeckId,
        message,
      });
      return { status: "error" };
    } finally {
      setAssigningDeckIds((prev) => {
        const next = new Set(prev);
        next.delete(normalizedDeckId);
        return next;
      });
    }
  }, [addToPersonalLibrary, assignDeck, assigningDeckIds, onAssigned, onLogAction, requiredMode, requiredPool, setDeckStatus, studentId]);

  const handleAssign = async (deckId) => {
    const result = await assignOneDeck(deckId, { notifyParent: true });
    if (result.status === "assigned") {
      await tryMoveToNextStudent();
      if (closeAfterAssign) setOpen(false);
    }
  };

  const handleAssignQueue = async () => {
    if (queueAssigning) return;
    const queueIds = [...selectedDeckIds].filter(Boolean);
    if (queueIds.length === 0) return;

    setQueueAssigning(true);
    let assignedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const deckId of queueIds) {
      const result = await assignOneDeck(deckId, { silent: true, notifyParent: false });
      if (result.status === "assigned") assignedCount += 1;
      else if (result.status === "duplicate") duplicateCount += 1;
      else if (result.status === "error") errorCount += 1;
    }

    if (assignedCount > 0) {
      toast.success(`Assigned ${assignedCount} deck${assignedCount === 1 ? "" : "s"}.`);
      onAssigned?.();
    }
    if (duplicateCount > 0) {
      toast.info(`${duplicateCount} deck${duplicateCount === 1 ? " was" : "s were"} already assigned.`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} assignment${errorCount === 1 ? "" : "s"} failed.`);
    }

    if (assignedCount > 0) {
      await onLogAction?.("deck_queue_assigned", studentId, {
        assignedCount,
        duplicateCount,
        errorCount,
        deckIds: queueIds,
        requiredPool,
        requiredMode,
      });
    }

    if (assignedCount > 0) {
      await tryMoveToNextStudent();
      if (closeAfterAssign) setOpen(false);
    }

    setQueueAssigning(false);
  };

  const toggleDeckSelection = (deckId) => {
    setSelectedDeckIds((prev) => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  };

  const applyTemplate = (templateId) => {
    const template = ASSIGNMENT_TEMPLATES.find((entry) => entry.id === templateId);
    if (!template) return;
    setRequiredPool(template.requiredPool);
    setRequiredMode(template.requiredMode);
    setAddToPersonalLibrary(template.addToPersonalLibrary);
    toast.info(`Template applied: ${template.label}`);
  };

  const statusLabel = (status) => {
    if (status === "assigning") return "Assigning";
    if (status === "assigned") return "Assigned";
    if (status === "duplicate") return "Already assigned";
    if (status === "error") return "Failed";
    return "";
  };

  return (
    <Modal open={open} setOpen={setOpen}>
      <h3>Assign deck to {studentName || "Student"}</h3>

      <div className={styles.assignTopControls}>
        <label className={styles.inlineToggle}>
          <input
            type="checkbox"
            checked={Boolean(stickyAssignNext)}
            onChange={(event) => setStickyAssignNext?.(event.target.checked)}
          />
          <span>Assign same settings to next student</span>
        </label>
        <label className={styles.inlineToggle}>
          <input
            type="checkbox"
            checked={queueMode}
            onChange={(event) => setQueueMode(event.target.checked)}
          />
          <span>Queue mode (multiple decks)</span>
        </label>
        <label className={styles.inlineToggle}>
          <input
            type="checkbox"
            checked={closeAfterAssign}
            onChange={(event) => setCloseAfterAssign(event.target.checked)}
          />
          <span>Close after assign</span>
        </label>
      </div>

      <div className={styles.assignTemplateRow}>
        {ASSIGNMENT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className={styles.assignTemplateButton}
            onClick={() => applyTemplate(template.id)}
          >
            {template.label}
          </button>
        ))}
      </div>

      {recentDecks.length > 0 && (
        <div style={{ marginBottom: "0.7rem" }}>
          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Recent decks
          </label>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {recentDecks.map((deck) => (
              <button
                key={`recent-${deck.id}`}
                type="button"
                className={styles.assignTemplateButton}
                onClick={() => handleAssign(deck.id)}
                disabled={assigningDeckIds.has(deck.id) || queueAssigning}
                title={deck.name}
              >
                {deck.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "0.6rem" }}>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.2rem" }}>
          Required study type
        </label>
        <select
          value={requiredPool}
          onChange={(event) => setRequiredPool(event.target.value)}
          style={{
            width: "100%",
            padding: "0.45rem",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius)",
            background: "var(--bg-secondary)",
            color: "var(--fg)",
            fontSize: "0.85rem",
          }}
        >
          <option value="any">Any completion (student chooses)</option>
          <option value="new">Learn new words only</option>
          <option value="due">Review due cards only</option>
          <option value="mixed">Mixed session (new + due)</option>
        </select>
      </div>

      <div style={{ marginBottom: "0.6rem" }}>
        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.2rem" }}>
          Study mode
        </label>
        <select
          value={requiredMode}
          onChange={(event) => setRequiredMode(event.target.value)}
          style={{
            width: "100%",
            padding: "0.45rem",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius)",
            background: "var(--bg-secondary)",
            color: "var(--fg)",
            fontSize: "0.85rem",
          }}
        >
          <option value="any">Any mode (student chooses)</option>
          <option value="flashcards">Flashcards (flip and rate)</option>
          <option value="quiz">Fill-in-the-blank</option>
          <option value="mcq">Multiple choice</option>
          <option value="match">Match game</option>
          <option value="wheel">Spin wheel</option>
        </select>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.8rem", fontSize: "0.84rem" }}>
        <input
          type="checkbox"
          checked={addToPersonalLibrary}
          onChange={(event) => setAddToPersonalLibrary(event.target.checked)}
          style={{ marginTop: "0.1rem" }}
        />
        <span>
          <strong>Also add deck to student library</strong>
          <span style={{ display: "block", color: "var(--fg-muted)", marginTop: "0.15rem" }}>
            Student keeps assigned study flow and gets a personal copy.
          </span>
        </span>
      </label>

      <input
        type="text"
        className={styles.searchInput}
        placeholder="Search decks..."
        value={deckSearch}
        onChange={(event) => setDeckSearch(event.target.value)}
        style={{ maxWidth: "none", marginBottom: "0.6rem" }}
      />

      {queueMode && (
        <div className={styles.assignQueueControls}>
          <Button
            callback={() => setSelectedDeckIds(new Set(filteredDecks.map((deck) => deck.id)))}
            bgcolor="transparent"
            color="var(--fg)"
          >
            Select visible
          </Button>
          <Button
            callback={() => setSelectedDeckIds(new Set())}
            bgcolor="transparent"
            color="var(--fg-muted)"
          >
            Clear
          </Button>
          <Button
            callback={handleAssignQueue}
            disabled={queueAssigning || selectedDeckIds.size === 0}
          >
            {queueAssigning
              ? "Assigning queue..."
              : `Assign selected (${selectedDeckIds.size})`}
          </Button>
        </div>
      )}

      {loading ? (
        <p>Loading decks...</p>
      ) : (
        <div className={styles.deckList}>
          {(filteredDecks || []).map((deck) => {
            const deckId = String(deck.id || "");
            const status = assignStatuses[deckId];
            const isBusy = assigningDeckIds.has(deckId) || queueAssigning;

            return (
              <div key={deck.id} className={styles.assignRow}>
                {queueMode && (
                  <input
                    type="checkbox"
                    checked={selectedDeckIds.has(deck.id)}
                    onChange={() => toggleDeckSelection(deck.id)}
                    style={{ marginRight: "0.25rem" }}
                  />
                )}
                <span>{deck.name}</span>
                <Badge>{deck.cardCount} cards</Badge>
                {status && (
                  <span
                    className={`${styles.assignStatus} ${styles[`assignStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`] || ""}`}
                  >
                    {statusLabel(status)}
                  </span>
                )}
                <Button callback={() => handleAssign(deck.id)} disabled={isBusy}>
                  {assigningDeckIds.has(deckId) ? "Assigning..." : "Assign"}
                </Button>
              </div>
            );
          })}
          {(!filteredDecks || filteredDecks.length === 0) && (
            <p>No decks match the search.</p>
          )}
        </div>
      )}

      <div className={styles.modalActions} style={{ gap: "0.5rem" }}>
        <Button
          callback={async () => {
            const moved = await Promise.resolve(onAssignNextStudent?.(studentId));
            if (!moved) toast.info("No next student in current list.");
          }}
          bgcolor="transparent"
          color="var(--fg-muted)"
          disabled={!onAssignNextStudent}
        >
          Next student
        </Button>
      </div>
    </Modal>
  );
};

const StudentsPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    data: linkedStudents,
    loading: linkedLoading,
    refetch: refetchLinkedStudents,
  } = useStudents();
  const {
    data: rosterStudents,
    loading: rosterLoading,
    lastUpdatedAt,
    error: rosterError,
    refetch: refetchRoster,
  } = useTutproRoster();
  const {
    data: assignments,
    refetch: refetchAssignments,
  } = useAssignments();
  const { logActivity } = useLogActivity();
  const { data: recentActivity } = useRecentActivity(300);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [stickyAssignNext, setStickyAssignNext] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STICKY_NEXT_STUDENT_KEY)) === true;
    } catch {
      return false;
    }
  });
  const [assignModal, setAssignModal] = useState({
    open: false,
    studentId: null,
    studentName: "",
  });

  useEffect(() => {
    try {
      localStorage.setItem(STICKY_NEXT_STUDENT_KEY, JSON.stringify(stickyAssignNext));
    } catch {
      // ignore storage failure
    }
  }, [stickyAssignNext]);

  const loading = linkedLoading || rosterLoading;

  const studentRows = useMemo(
    () => buildStudentRows(rosterStudents || [], linkedStudents || []),
    [linkedStudents, rosterStudents]
  );

  const assignmentSummaryMap = useMemo(
    () => buildStudentAssignmentSummaryMap(assignments || []),
    [assignments]
  );

  const activitySummaryMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(recentActivity) ? recentActivity : []).forEach((entry) => {
      const metadataStudentId = String(entry?.metadata?.studentId || entry?.metadata?.student_id || "").trim();
      const targetStudentId = String(entry?.target_type === "student" ? entry?.target_id : "").trim();
      const studentId = targetStudentId || metadataStudentId;
      if (!studentId || map.has(studentId)) return;
      const action = String(entry?.action || "").trim();
      map.set(studentId, {
        action,
        createdAt: entry?.created_at,
        label: ACTION_LABELS[action] || action.replace(/_/g, " "),
      });
    });
    return map;
  }, [recentActivity]);

  const linkedCount = studentRows.filter((student) => student.linkedProfile).length;
  const needsLaunchCount = studentRows.filter((student) => student.status === "needs-launch").length;

  const filteredStudentRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = studentRows;
    if (q) {
      list = list.filter((student) => {
        const name = (student.displayName || "").toLowerCase();
        const email = (student.email || "").toLowerCase();
        const tutproId = String(student.rosterStudent?.tutproStudentId || "").toLowerCase();
        return name.includes(q) || email.includes(q) || tutproId.includes(q);
      });
    }
    switch (sortBy) {
      case "name":
        list = [...list].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        break;
      case "status":
        list = [...list].sort((a, b) => (a.status === "linked" ? -1 : 1) - (b.status === "linked" ? -1 : 1));
        break;
      case "recent":
        list = [...list].sort((a, b) => {
          const aDate = a.linkedProfile?.last_active_at || "";
          const bDate = b.linkedProfile?.last_active_at || "";
          return bDate.localeCompare(aDate);
        });
        break;
      default:
        break;
    }
    return list;
  }, [searchQuery, sortBy, studentRows]);

  const readyRows = useMemo(
    () => filteredStudentRows.filter((row) => Boolean(row.linkedProfile?.id)),
    [filteredStudentRows]
  );

  const logStudentAction = useCallback(async (action, studentId, metadata = {}) => {
    const normalizedStudentId = String(studentId || "").trim();
    if (!normalizedStudentId) return;
    try {
      await logActivity(action, "student", normalizedStudentId, metadata);
    } catch (err) {
      console.warn("[StudentsPage] action log failed", err?.message || err);
    }
  }, [logActivity]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refetchLinkedStudents(),
      refetchRoster(),
      refetchAssignments(),
    ]);
  }, [refetchAssignments, refetchLinkedStudents, refetchRoster]);

  const openAssignModalForRow = useCallback((row) => {
    const linkedProfileId = String(row?.linkedProfile?.id || "").trim();
    if (!linkedProfileId) return;
    setAssignModal({
      open: true,
      studentId: linkedProfileId,
      studentName: row.displayName || "Student",
    });
  }, []);

  const moveToNextStudent = useCallback((currentStudentId) => {
    const normalizedCurrent = String(currentStudentId || "").trim();
    if (!normalizedCurrent || readyRows.length === 0) return false;
    const index = readyRows.findIndex((row) => String(row.linkedProfile?.id || "") === normalizedCurrent);
    if (index < 0 || index + 1 >= readyRows.length) return false;
    const nextRow = readyRows[index + 1];
    openAssignModalForRow(nextRow);
    logStudentAction("assign_next_student", nextRow.linkedProfile?.id, {
      fromStudentId: normalizedCurrent,
      toStudentId: nextRow.linkedProfile?.id,
    });
    return true;
  }, [logStudentAction, openAssignModalForRow, readyRows]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const assignStudentId = String(params.get("assign") || "").trim();
    if (!assignStudentId) return;

    const matched = studentRows.find((row) => String(row?.linkedProfile?.id || "") === assignStudentId);
    if (matched) {
      openAssignModalForRow(matched);
    }

    params.delete("assign");
    navigate({
      pathname: "/students",
      search: params.toString() ? `?${params.toString()}` : "",
    }, { replace: true });
  }, [location.search, navigate, openAssignModalForRow, studentRows]);

  const handleCopyLoginLink = useCallback(async (studentRow) => {
    const studentId = String(studentRow?.linkedProfile?.id || "").trim();
    const url = getStudentLoginUrl(studentRow?.linkedProfile, user?.id);
    if (!url) {
      toast.info("Login link is not available for this student yet.");
      return;
    }
    await copyText(url);
    toast.success("Login link copied!");
    logStudentAction("copy_login_link", studentId, { source: "students_list" });
  }, [logStudentAction, user?.id]);

  const handleCopyProfileLink = useCallback(async (studentRow) => {
    const studentId = String(studentRow?.linkedProfile?.id || "").trim();
    const url = getStudentProfileUrl(studentRow?.linkedProfile);
    if (!url) {
      toast.info("Profile link is not available.");
      return;
    }
    await copyText(url);
    toast.success("Profile link copied!");
    logStudentAction("copy_profile_link", studentId, { source: "students_list" });
  }, [logStudentAction]);

  const handleCopyBundle = useCallback(async (studentRow) => {
    const studentId = String(studentRow?.linkedProfile?.id || "").trim();
    if (!studentId) {
      toast.info("Bundle is available only for linked students.");
      return;
    }

    const loginUrl = getStudentLoginUrl(studentRow?.linkedProfile, user?.id) || "Not available";
    const profileUrl = getStudentProfileUrl(studentRow?.linkedProfile) || "Not available";
    const assignmentSummary = assignmentSummaryMap.get(studentId) || {
      total: 0,
      dueSoon: 0,
      overdue: 0,
      avgProgress: 0,
      deckNames: [],
    };

    const lines = [
      `Student: ${studentRow.displayName || "Student"}`,
      studentRow.email ? `Email: ${studentRow.email}` : "",
      `Login link: ${loginUrl}`,
      `Profile link: ${profileUrl}`,
      `Assigned decks: ${assignmentSummary.total}`,
      `Due soon: ${assignmentSummary.dueSoon}, overdue: ${assignmentSummary.overdue}`,
      `Average progress: ${assignmentSummary.avgProgress}%`,
      assignmentSummary.deckNames.length > 0
        ? `Deck list: ${assignmentSummary.deckNames.join(", ")}`
        : "Deck list: none",
    ].filter(Boolean);

    await copyText(lines.join("\n"));
    toast.success("Student bundle copied!");
    logStudentAction("copy_student_bundle", studentId, { source: "students_list" });
  }, [assignmentSummaryMap, logStudentAction, user?.id]);

  const handleOpenStudentApp = useCallback((studentRow) => {
    const studentId = String(studentRow?.linkedProfile?.id || "").trim();
    const url = getStudentLoginUrl(studentRow?.linkedProfile, user?.id);
    if (!url) {
      toast.info("Student app launch link is not available.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    logStudentAction("open_student_app", studentId, { source: "students_list" });
  }, [logStudentAction, user?.id]);

  const handleSendReminder = useCallback(async (studentRow) => {
    const studentId = String(studentRow?.linkedProfile?.id || "").trim();
    const loginUrl = getStudentLoginUrl(studentRow?.linkedProfile, user?.id) || "";
    const displayName = studentRow?.displayName || "Student";
    const body = [
      `Hi ${displayName},`,
      "Please open your student app and continue your assigned DeckTrack studies.",
      loginUrl ? `Login link: ${loginUrl}` : "",
    ].filter(Boolean).join("\n\n");

    const email = String(studentRow?.email || "").trim();
    if (email) {
      const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("DeckTrack study reminder")}&body=${encodeURIComponent(body)}`;
      window.open(mailto, "_blank", "noopener,noreferrer");
    }

    await copyText(body);
    toast.success(email ? "Reminder opened in mail app and copied." : "Reminder copied.");
    logStudentAction("reminder_prepared", studentId, {
      source: "students_list",
      inactive: studentRow?.rosterStudent?.inactive === true,
      hasEmail: Boolean(email),
    });
  }, [logStudentAction, user?.id]);

  if (loading) return <LoadingScreen />;

  return (
    <>
      <AddStudentModal
        open={showAddModal}
        setOpen={setShowAddModal}
        onAdded={refreshAll}
      />

      <AssignDeckModal
        open={assignModal.open}
        setOpen={(value) => setAssignModal((state) => ({ ...state, open: value }))}
        studentId={assignModal.studentId}
        studentName={assignModal.studentName}
        onAssigned={refreshAll}
        onAssignNextStudent={moveToNextStudent}
        stickyAssignNext={stickyAssignNext}
        setStickyAssignNext={setStickyAssignNext}
        onLogAction={(action, studentTargetId, metadata) => logStudentAction(action, studentTargetId, metadata)}
      />

      <BulkAssignModal
        open={showBulkAssign}
        setOpen={setShowBulkAssign}
        students={(linkedStudents || []).map((s) => ({
          id: s.id,
          display_name: s.display_name || s.email || "Student",
          email: s.email,
        }))}
        onAssigned={refreshAll}
      />

      <div className={styles.header}>
        <div>
          <h1>my students</h1>
          <p className={styles.helperText}>
            TutPro students sync from your latest backup automatically. Students become assignable in DeckTrack after they open the flashcards link in the student app once.
          </p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.inlineToggle}>
            <input
              type="checkbox"
              checked={stickyAssignNext}
              onChange={(event) => setStickyAssignNext(event.target.checked)}
            />
            <span>Assign same settings to next student</span>
          </label>
          <Button callback={refreshAll} bgcolor="transparent" color="var(--fg)">Refresh roster</Button>
          <Button callback={() => setShowBulkAssign(true)}>
            Bulk assign deck
          </Button>
          <Button callback={() => setShowAddModal(true)} bgcolor="transparent" color="var(--fg)">
            Link existing account
          </Button>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>TutPro roster</span>
          <strong className={styles.summaryValue}>{rosterStudents?.length || 0}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Ready in DeckTrack</span>
          <strong className={styles.summaryValue}>{linkedCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Waiting for first launch</span>
          <strong className={styles.summaryValue}>{needsLaunchCount}</strong>
        </div>
      </div>

      {studentRows.length > 0 && (
        <div className={`${styles.stickyFilters}${searchQuery || sortBy !== 'name' ? ` ${styles.isStuck}` : ''}`}>
          <div className={styles.stickyFiltersInner}>
            <div className={styles.stickyFiltersStatus}>
              <div className={styles.searchSortBar} style={{ margin: 0 }}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search by name, email, or TutPro ID..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <select
                  className={styles.sortSelect}
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="name">Sort: Name</option>
                  <option value="status">Sort: Status</option>
                  <option value="recent">Sort: Recent</option>
                </select>
              </div>
              {(searchQuery || sortBy !== 'name') && (
                <button
                  type="button"
                  className={styles.clearAllBtn}
                  onClick={() => { setSearchQuery(''); setSortBy('name'); }}
                >
                  ✕ Clear
                  <span className={styles.clearAllBadge}>{(searchQuery ? 1 : 0) + (sortBy !== 'name' ? 1 : 0)}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={styles.syncBanner}>
        <div>
          <strong>Roster sync</strong>
          <p>
            {lastUpdatedAt
              ? `Latest TutPro backup: ${new Date(lastUpdatedAt).toLocaleString()}`
              : "No TutPro backup was found yet. Open the teacher app and sync once to populate this list."}
          </p>
        </div>
        {rosterError && (
          <Badge>
            {rosterError.message || "Could not read TutPro roster"}
          </Badge>
        )}
      </div>

      {filteredStudentRows.length === 0 ? (
        <div className={styles.empty}>
          <h2>{searchQuery ? "No matching students" : "No students yet"}</h2>
          <p>{searchQuery ? "Try a different search term." : "Sync your TutPro backup or link an existing DeckTrack student account to get started."}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredStudentRows.map((studentRow) => {
            const linkedProfile = studentRow.linkedProfile;
            const rosterStudent = studentRow.rosterStudent;
            const isReady = Boolean(linkedProfile);
            const studentId = String(linkedProfile?.id || "").trim();
            const displayName = studentRow.displayName;
            const displayEmail = studentRow.email;
            const assignmentSummary = assignmentSummaryMap.get(studentId) || {
              total: 0,
              overdue: 0,
              dueSoon: 0,
              avgProgress: 0,
              risk: "low",
              riskLabel: "Low risk",
              deckNames: [],
            };
            const activitySummary = activitySummaryMap.get(studentId);
            const duePending = assignmentSummary.overdue + assignmentSummary.dueSoon;

            return (
              <div key={studentRow.key} className={styles.studentCard}>
                <div className={styles.studentCardTop}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div className={styles.avatar}>
                      {(displayName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.studentInfo}>
                      <h3>{displayName}</h3>
                      {displayEmail && <p className={styles.email}>{displayEmail}</p>}
                    </div>
                  </div>
                  <div className={styles.badgeRow}>
                    {studentRow.source === "tutpro" && <Badge>TutPro</Badge>}
                    {linkedProfile && <Badge>Ready</Badge>}
                    {!linkedProfile && <Badge>Pending</Badge>}
                    {rosterStudent?.inactive && <Badge>Inactive</Badge>}
                  </div>
                </div>

                <div className={styles.detailsGrid}>
                  {rosterStudent?.tutproStudentId && (
                    <div>
                      <span className={styles.detailLabel}>TutPro ID</span>
                      <span className={styles.detailValue}>{rosterStudent.tutproStudentId}</span>
                    </div>
                  )}
                  {rosterStudent?.level && (
                    <div>
                      <span className={styles.detailLabel}>Level</span>
                      <span className={styles.detailValue}>{rosterStudent.level}</span>
                    </div>
                  )}
                  {rosterStudent?.phone && (
                    <div>
                      <span className={styles.detailLabel}>Phone</span>
                      <span className={styles.detailValue}>{rosterStudent.phone}</span>
                    </div>
                  )}
                  {linkedProfile?.last_active_at && (
                    <div>
                      <span className={styles.detailLabel}>Last active</span>
                      <span className={styles.detailValue}>
                        {new Date(linkedProfile.last_active_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {isReady && (
                  <div className={styles.healthChipRow}>
                    <span className={styles.healthChip}>{assignmentSummary.total} assigned</span>
                    <span className={styles.healthChip}>{duePending} due</span>
                    <span
                      className={`${styles.healthChip} ${
                        assignmentSummary.risk === "high"
                          ? styles.healthRiskHigh
                          : assignmentSummary.risk === "medium"
                            ? styles.healthRiskMedium
                            : styles.healthRiskLow
                      }`}
                    >
                      {assignmentSummary.riskLabel}
                    </span>
                    {linkedProfile?.last_active_at && (
                      <span className={styles.healthChip}>Active {formatRelativeTime(linkedProfile.last_active_at)}</span>
                    )}
                  </div>
                )}

                {activitySummary && (
                  <p className={styles.auditText}>
                    Last action: {activitySummary.label} {formatRelativeTime(activitySummary.createdAt)}
                  </p>
                )}

                {rosterStudent?.notes && (
                  <p className={styles.cardNote}>{rosterStudent.notes}</p>
                )}

                <div className={styles.studentActions}>
                  <Button
                    callback={() => openAssignModalForRow(studentRow)}
                    disabled={!isReady}
                  >
                    Assign deck
                  </Button>

                  {isReady ? (
                    <Link
                      className={styles.actionLink}
                      to={`/students/${linkedProfile.id}`}
                      onClick={() => logStudentAction("open_student_progress", linkedProfile.id, { source: "students_list" })}
                    >
                      View progress
                    </Link>
                  ) : (
                    <span className={styles.pendingHint}>
                      Ask the student to open Flashcards in the student app once.
                    </span>
                  )}

                  {isReady && (
                    <details className={styles.moreMenu}>
                      <summary className={styles.moreSummary}>More</summary>
                      <div className={styles.moreActions}>
                        <button type="button" className={styles.moreActionButton} onClick={() => handleCopyLoginLink(studentRow)}>
                          Copy login link
                        </button>
                        <button type="button" className={styles.moreActionButton} onClick={() => handleCopyProfileLink(studentRow)}>
                          Copy profile link
                        </button>
                        <button type="button" className={styles.moreActionButton} onClick={() => handleCopyBundle(studentRow)}>
                          Copy quick bundle
                        </button>
                        <button type="button" className={styles.moreActionButton} onClick={() => handleOpenStudentApp(studentRow)}>
                          Open student app
                        </button>
                        {rosterStudent?.inactive && (
                          <button type="button" className={styles.moreActionButton} onClick={() => handleSendReminder(studentRow)}>
                            Send reminder
                          </button>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default StudentsPage;
