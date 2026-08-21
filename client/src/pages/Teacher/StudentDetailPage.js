import { useParams } from "react-router";
import { Link, useNavigate } from "react-router-dom";
import styles from "./Teacher.module.css";
import {
  useStudentStats,
  useTeacherUpdateStudentCard,
  useUpdateAssignment,
  useDeleteAssignment,
  useTeacherDeleteStudentCard,
  useTeacherResetStudentCard,
  useUpdateDeck,
  useDeleteDeck,
  useUpdateCard,
  useDeleteCard,
  useLogActivity,
} from "../../hooks/useSupabaseData";
import { useAuth } from "../../contexts/AuthContext";
import LoadingScreen from "../../common/components/LoadingScreen";
import Badge from "../../common/components/Badge";
import Button from "../../common/components/Button";
import Modal from "../../common/components/Modal";
import ConfirmModal from "../../common/components/ConfirmModal";
import RichTextInput from "../../common/components/RichTextInput";
import { useState, useEffect, useCallback, useMemo } from "react";
import { buildStudentAppLaunchUrl, getProfileTutproStudentId } from "../../lib/tutproRoster";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "react-toastify";
import AssignmentSettingsModal from "./AssignmentSettingsModal";

/* ── SVG Icons ── */
const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const ChevDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
);
const ChevUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
);
const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);
const ArchiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);
const ResetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
);
const RestoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
);

const escapeCsvCell = (value) => {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
};

const exportStudySessionsCsv = (sessions, studentLabel) => {
  const rows = [
    [
      'started_at',
      'finished_at',
      'session_type',
      'mode',
      'deck_name',
      'assignment_id',
      'cards_studied',
      'cards_correct',
      'cards_incorrect',
      'duration_seconds',
      'days_until_deletion',
      'deletion_at',
    ].join(','),
  ];

  (sessions || []).forEach((session) => {
    rows.push([
      escapeCsvCell(session.started_at),
      escapeCsvCell(session.finished_at),
      escapeCsvCell(session.session_type),
      escapeCsvCell(session.mode),
      escapeCsvCell(session.deck_name),
      escapeCsvCell(session.assignment_id),
      escapeCsvCell(session.cards_studied),
      escapeCsvCell(session.cards_correct ?? session.correct_count ?? 0),
      escapeCsvCell(session.cards_incorrect ?? session.incorrect_count ?? 0),
      escapeCsvCell(session.duration_seconds),
      escapeCsvCell(session.days_until_deletion),
      escapeCsvCell(session.deletion_at),
    ].join(','));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeStudent = String(studentLabel || 'student').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  link.download = `${safeStudent || 'student'}-study-sessions.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const sessionRetentionLabel = (session) => {
  const days = Number(session?.days_until_deletion);
  if (!Number.isFinite(days)) return 'No expiry info';
  if (days <= 0) return 'Deletes today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
};

const copyText = async (text) => {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
};

const getStudentAppLoginUrl = (profile, teacherId) => {
  const resolvedTeacherId = String(profile?.teacher_id || teacherId || '').trim();
  const studentId = getProfileTutproStudentId(profile);
  const studentName = String(profile?.display_name || profile?.email || '').trim();
  if (!resolvedTeacherId || !studentId || !studentName) return null;
  return buildStudentAppLaunchUrl({
    baseUrl: `${window.location.origin}${import.meta.env.BASE_URL}`,
    teacherId: resolvedTeacherId,
    studentId,
    studentName,
  });
};

const StudentDetailPage = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: stats, loading: statsLoading } = useStudentStats(studentId);
  const [student, setStudent] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [personalDecks, setPersonalDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settingsModal, setSettingsModal] = useState({ open: false, assignment: null });
  const [expandedCards, setExpandedCards] = useState({}); // { assignmentId: [cards] | 'loading' }
  const [expandedPersonal, setExpandedPersonal] = useState({}); // { deckId: [cards] | 'loading' }
  const [editModal, setEditModal] = useState({ open: false, card: null, assignmentId: null });
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editExample, setEditExample] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [showArchivedAssignments, setShowArchivedAssignments] = useState(false);
  const [showArchivedPersonal, setShowArchivedPersonal] = useState(false);
  const [archivedPersonalDecks, setArchivedPersonalDecks] = useState([]);
  const [editPersonalModal, setEditPersonalModal] = useState({ open: false, card: null, deckId: null });
  const [editPersonalFront, setEditPersonalFront] = useState('');
  const [editPersonalBack, setEditPersonalBack] = useState('');
  const [editPersonalSaving, setEditPersonalSaving] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, message: '', action: null, danger: false });
  const { updateCard } = useTeacherUpdateStudentCard();
  const { updateAssignment } = useUpdateAssignment();
  const { deleteAssignment } = useDeleteAssignment();
  const { teacherDeleteStudentCard } = useTeacherDeleteStudentCard();
  const { resetCard } = useTeacherResetStudentCard();
  const { updateDeck: updatePersonalDeck } = useUpdateDeck();
  const { deleteDeck: deletePersonalDeck } = useDeleteDeck();
  const { updateCard: updatePersonalCard } = useUpdateCard();
  const { deleteCard: deletePersonalCard } = useDeleteCard();
  const { logActivity } = useLogActivity();

  const detailStudentId = String(student?.id || studentId || '').trim();

  const assignmentHealth = useMemo(() => {
    const now = Date.now();
    const dueSoonThreshold = now + (3 * 24 * 60 * 60 * 1000);
    let total = 0;
    let pending = 0;
    let dueSoon = 0;
    let overdue = 0;

    (assignments || []).forEach((assignment) => {
      if (assignment?.is_archived) return;
      total += 1;

      const progress = Number(assignment?.progress_percent);
      const isCompleted = assignment?.completed === true || progress >= 100;
      if (isCompleted) return;

      pending += 1;
      const deadlineTs = Date.parse(String(assignment?.deadline || ''));
      if (!Number.isFinite(deadlineTs)) return;
      if (deadlineTs < now) overdue += 1;
      else if (deadlineTs <= dueSoonThreshold) dueSoon += 1;
    });

    return { total, pending, dueSoon, overdue };
  }, [assignments]);

  const studentAppLoginUrl = useMemo(
    () => getStudentAppLoginUrl(student, user?.id),
    [student, user?.id]
  );

  const studentProgressUrl = useMemo(() => {
    if (!detailStudentId) return null;
    return new URL(`students/${encodeURIComponent(detailStudentId)}`, `${window.location.origin}${import.meta.env.BASE_URL}`).toString();
  }, [detailStudentId]);

  const logStudentAction = useCallback(async (action, metadata = {}) => {
    if (!detailStudentId) return;
    try {
      await logActivity(action, 'student', detailStudentId, metadata);
    } catch (err) {
      console.warn('[StudentDetailPage] action log failed', err?.message || err);
    }
  }, [detailStudentId, logActivity]);

  const handleOpenAssignFlow = useCallback(() => {
    if (!detailStudentId) return;
    navigate(`/students?assign=${encodeURIComponent(detailStudentId)}`);
  }, [detailStudentId, navigate]);

  const handleOpenStudentApp = useCallback(() => {
    if (!studentAppLoginUrl) {
      toast.info('Student app launch link is not available yet.');
      return;
    }
    window.open(studentAppLoginUrl, '_blank', 'noopener,noreferrer');
    logStudentAction('open_student_app', { source: 'student_detail' });
  }, [logStudentAction, studentAppLoginUrl]);

  const handleCopyLoginLink = useCallback(async () => {
    if (!studentAppLoginUrl) {
      toast.info('Login link is not available for this student yet.');
      return;
    }
    await copyText(studentAppLoginUrl);
    toast.success('Login link copied!');
    logStudentAction('copy_login_link', { source: 'student_detail' });
  }, [logStudentAction, studentAppLoginUrl]);

  const handleCopyProfileLink = useCallback(async () => {
    if (!studentProgressUrl) {
      toast.info('Profile link is not available.');
      return;
    }
    await copyText(studentProgressUrl);
    toast.success('Profile link copied!');
    logStudentAction('copy_profile_link', { source: 'student_detail' });
  }, [logStudentAction, studentProgressUrl]);

  const handleCopyBundle = useCallback(async () => {
    const deckNames = (assignments || [])
      .filter((assignment) => !assignment?.is_archived)
      .map((assignment) => String(assignment?.custom_name || '').trim() || String(assignment?.flashy_decks?.name || '').trim())
      .filter(Boolean)
      .slice(0, 10);

    const lines = [
      `Student: ${student?.display_name || student?.email || 'Student'}`,
      student?.email ? `Email: ${student.email}` : '',
      `Login link: ${studentAppLoginUrl || 'Not available'}`,
      `Profile link: ${studentProgressUrl || 'Not available'}`,
      `Assigned decks: ${assignmentHealth.total}`,
      `Pending: ${assignmentHealth.pending}, due soon: ${assignmentHealth.dueSoon}, overdue: ${assignmentHealth.overdue}`,
      deckNames.length ? `Deck list: ${deckNames.join(', ')}` : 'Deck list: none',
    ].filter(Boolean);

    await copyText(lines.join('\n'));
    toast.success('Student bundle copied!');
    logStudentAction('copy_student_bundle', { source: 'student_detail' });
  }, [assignmentHealth.dueSoon, assignmentHealth.overdue, assignmentHealth.pending, assignmentHealth.total, assignments, logStudentAction, student?.display_name, student?.email, studentAppLoginUrl, studentProgressUrl]);

  const handlePrepareReminder = useCallback(async () => {
    const displayName = student?.display_name || student?.email || 'Student';
    const body = [
      `Hi ${displayName},`,
      'Please open your student app and continue your assigned DeckTrack studies.',
      studentAppLoginUrl ? `Login link: ${studentAppLoginUrl}` : '',
    ].filter(Boolean).join('\n\n');

    const email = String(student?.email || '').trim();
    if (email) {
      const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('DeckTrack study reminder')}&body=${encodeURIComponent(body)}`;
      window.open(mailto, '_blank', 'noopener,noreferrer');
    }

    await copyText(body);
    toast.success(email ? 'Reminder opened in mail app and copied.' : 'Reminder copied.');
    logStudentAction('reminder_prepared', {
      source: 'student_detail',
      hasEmail: Boolean(email),
    });
  }, [logStudentAction, student?.display_name, student?.email, studentAppLoginUrl]);

  const openEditCard = (card, assignmentId) => {
    setEditFront(card.front || '');
    setEditBack(card.back || '');
    setEditExample(card.example_sentence || '');
    setEditNotes(card.notes || '');
    setEditModal({ open: true, card, assignmentId });
  };

  const handleSaveCardEdit = async () => {
    if (!editModal.card) return;
    setEditSaving(true);
    try {
      const updated = await updateCard(editModal.card.id, {
        front: editFront.trim(),
        back: editBack.trim(),
        example_sentence: editExample.trim(),
        notes: editNotes.trim(),
      });
      setExpandedCards((prev) => {
        const cards = prev[editModal.assignmentId];
        if (!Array.isArray(cards)) return prev;
        return { ...prev, [editModal.assignmentId]: cards.map(c => c.id === updated.id ? { ...c, ...updated } : c) };
      });
      toast.success('Card updated');
      setEditModal({ open: false, card: null, assignmentId: null });
    } catch (err) {
      toast.error(err.message || 'Failed to update card');
    } finally {
      setEditSaving(false);
    }
  };

  /* ── Personal deck management ── */
  const handleArchivePersonalDeck = async (deckId) => {
    try {
      await updatePersonalDeck(deckId, { is_archived: true });
      toast.success('Deck archived');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to archive');
    }
  };

  const handleRestorePersonalDeck = async (deckId) => {
    try {
      await updatePersonalDeck(deckId, { is_archived: false });
      toast.success('Deck restored');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to restore');
    }
  };

  const handleDeletePersonalDeck = async (deckId, name) => {
    setConfirmState({
      open: true, danger: true,
      message: `Permanently delete "${name}" and all its cards? This cannot be undone.`,
      action: async () => {
        try {
          await deletePersonalDeck(deckId);
          toast.success('Deck deleted permanently');
          fetchData();
        } catch (err) {
          toast.error(err.message || 'Failed to delete');
        }
      },
    });
  };

  const openEditPersonalCard = (card, deckId) => {
    setEditPersonalFront(card.front || '');
    setEditPersonalBack(card.back || '');
    setEditPersonalModal({ open: true, card, deckId });
  };

  const handleSavePersonalCardEdit = async () => {
    if (!editPersonalModal.card) return;
    setEditPersonalSaving(true);
    try {
      const updated = await updatePersonalCard(editPersonalModal.card.id, {
        front: editPersonalFront.trim(),
        back: editPersonalBack.trim(),
      });
      setExpandedPersonal((prev) => {
        const cards = prev[editPersonalModal.deckId];
        if (!Array.isArray(cards)) return prev;
        return { ...prev, [editPersonalModal.deckId]: cards.map(c => c.id === updated.id ? { ...c, ...updated } : c) };
      });
      toast.success('Card updated');
      setEditPersonalModal({ open: false, card: null, deckId: null });
    } catch (err) {
      toast.error(err.message || 'Failed to update card');
    } finally {
      setEditPersonalSaving(false);
    }
  };

  const handleDeletePersonalCard = async (cardId, deckId) => {
    setConfirmState({
      open: true, danger: true,
      message: 'Delete this card? This cannot be undone.',
      action: async () => {
        try {
          await deletePersonalCard(cardId);
          setExpandedPersonal((prev) => {
            const cards = prev[deckId];
            if (!Array.isArray(cards)) return prev;
            return { ...prev, [deckId]: cards.filter(c => c.id !== cardId) };
          });
          toast.success('Card deleted');
        } catch (err) {
          toast.error(err.message || 'Failed to delete card');
        }
      },
    });
  };

  const handleDeleteStudentCard = async (cardId, assignmentId) => {
    setConfirmState({
      open: true, danger: true,
      message: 'Delete this student card? This cannot be undone.',
      action: async () => {
        try {
          await teacherDeleteStudentCard(cardId);
          setExpandedCards((prev) => {
            const cards = prev[assignmentId];
            if (!Array.isArray(cards)) return prev;
            return { ...prev, [assignmentId]: cards.filter(c => c.id !== cardId) };
          });
          toast.success('Card deleted');
        } catch (err) {
          toast.error(err.message || 'Failed to delete card');
        }
      },
    });
  };

  const handleResetStudentCard = async (cardId, assignmentId) => {
    try {
      const updated = await resetCard(cardId);
      setExpandedCards((prev) => {
        const cards = prev[assignmentId];
        if (!Array.isArray(cards)) return prev;
        return { ...prev, [assignmentId]: cards.map(c => c.id === cardId ? { ...c, ...updated } : c) };
      });
      toast.success('Card progress reset');
    } catch (err) {
      toast.error(err.message || 'Failed to reset card');
    }
  };

  const handleArchiveAssignment = async (assignmentId) => {
    try {
      await updateAssignment(assignmentId, { is_archived: true });
      toast.success('Assignment archived');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to archive');
    }
  };

  const handleRestoreAssignment = async (assignmentId) => {
    try {
      await updateAssignment(assignmentId, { is_archived: false });
      toast.success('Assignment restored');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to restore');
    }
  };

  const handleDeleteAssignment = async (assignmentId, deckName) => {
    setConfirmState({
      open: true, danger: true,
      message: `Permanently delete assignment "${deckName}" and all student cards? This cannot be undone.`,
      action: async () => {
        try {
          await deleteAssignment(assignmentId);
          toast.success('Assignment deleted permanently');
          fetchData();
        } catch (err) {
          toast.error(err.message || 'Failed to delete');
        }
      },
    });
  };

  const fetchCards = useCallback(async (assignmentId) => {
    if (expandedCards[assignmentId] && expandedCards[assignmentId] !== 'loading') {
      // Collapse
      setExpandedCards((prev) => { const next = { ...prev }; delete next[assignmentId]; return next; });
      return;
    }
    setExpandedCards((prev) => ({ ...prev, [assignmentId]: 'loading' }));
    const { data, error } = await supabase
      .from('flashy_student_cards')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: true });
    if (error) {
      setExpandedCards((prev) => { const next = { ...prev }; delete next[assignmentId]; return next; });
      return;
    }
    setExpandedCards((prev) => ({ ...prev, [assignmentId]: data || [] }));
  }, [expandedCards]);

  const fetchPersonalCards = useCallback(async (deckId) => {
    if (expandedPersonal[deckId] && expandedPersonal[deckId] !== 'loading') {
      setExpandedPersonal((prev) => { const next = { ...prev }; delete next[deckId]; return next; });
      return;
    }
    setExpandedPersonal((prev) => ({ ...prev, [deckId]: 'loading' }));
    const { data, error } = await supabase
      .from('flashy_cards')
      .select('*')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true });
    if (error) {
      setExpandedPersonal((prev) => { const next = { ...prev }; delete next[deckId]; return next; });
      return;
    }
    setExpandedPersonal((prev) => ({ ...prev, [deckId]: data || [] }));
  }, [expandedPersonal]);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);

    const [profileRes, assignRes, personalRes, archivedRes] = await Promise.all([
      supabase
        .from("flashy_profiles")
        .select("*")
        .eq("id", studentId)
        .single(),
      supabase
        .from("flashy_deck_assignments")
        .select("*, flashy_decks(name, description)")
        .eq("student_id", studentId)
        .eq("teacher_id", user.id)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("flashy_decks")
        .select("*, flashy_cards(id)")
        .eq("owner_id", studentId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("flashy_decks")
        .select("*, flashy_cards(id)")
        .eq("owner_id", studentId)
        .eq("is_archived", true)
        .order("created_at", { ascending: false }),
    ]);

    if (profileRes.data) setStudent(profileRes.data);
    if (assignRes.data) setAssignments(assignRes.data);
    if (personalRes.data) setPersonalDecks(personalRes.data);
    if (archivedRes.data) setArchivedPersonalDecks(archivedRes.data);
    setLoading(false);
  }, [studentId, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || statsLoading) return <LoadingScreen />;
  if (!student) return <h2>Student not found</h2>;

  const recentSessions = stats?.recentSessions || [];

  return (
    <>
    <div>
      <div className={styles.header}>
        <div>
          <Link to="/students" className={styles.backLink} style={{ fontSize: "0.8rem", marginBottom: "0.15rem", display: "inline-block" }}>
            ← Back to Students
          </Link>
          <h1>{student.display_name || student.email || "Student"}</h1>
        </div>
        <p className={styles.email}>{student.email}</p>
      </div>

      <div style={{
        border: 'var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--card-bg)',
        padding: '0.65rem',
        marginBottom: '0.85rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div>
            <p className={styles.helperText} style={{ margin: 0 }}>Quick actions</p>
            <div className={styles.healthChipRow} style={{ marginTop: '0.35rem' }}>
              <span className={styles.healthChip}>{assignmentHealth.total} assigned</span>
              <span className={styles.healthChip}>{assignmentHealth.pending} pending</span>
              <span className={styles.healthChip}>{assignmentHealth.dueSoon} due soon</span>
              {assignmentHealth.overdue > 0 && (
                <span className={`${styles.healthChip} ${styles.healthRiskHigh}`}>{assignmentHealth.overdue} overdue</span>
              )}
            </div>
          </div>
          <div className={styles.studentActions}>
            <Button callback={handleOpenAssignFlow}>Assign deck</Button>
            <Button callback={handleOpenStudentApp} bgcolor="transparent" color="var(--fg)">Open student app</Button>
            <Button callback={handleCopyLoginLink} bgcolor="transparent" color="var(--fg)">Copy login link</Button>
            <Button callback={handleCopyProfileLink} bgcolor="transparent" color="var(--fg)">Copy profile link</Button>
            <Button callback={handleCopyBundle} bgcolor="transparent" color="var(--fg)">Copy quick bundle</Button>
            <Button callback={handlePrepareReminder} bgcolor="transparent" color="var(--fg-muted)">Prepare reminder</Button>
          </div>
        </div>
      </div>

      {/* Stats overview */}
      {stats && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statBox}>
              <span className={styles.statNumber}>{stats.totalCards}</span>
              <span className={styles.statLabel}>Total Cards</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statNumber}>{stats.masteredCards}</span>
              <span className={styles.statLabel}>Mastered</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statNumber}>{stats.dueCards}</span>
              <span className={styles.statLabel}>Due Now</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statNumber}>{stats.newCards}</span>
              <span className={styles.statLabel}>New</span>
            </div>
          </div>
          {stats.totalCards > 0 && (
            <div className={styles.masteryBar}>
              <div className={styles.masteryTrack}>
                <div
                  className={styles.masteryFill}
                  style={{ width: `${Math.round((stats.masteredCards / stats.totalCards) * 100)}%` }}
                />
              </div>
              <span className={styles.masteryPct}>
                {Math.round((stats.masteredCards / stats.totalCards) * 100)}% mastered
              </span>
            </div>
          )}
        </>
      )}

      {/* Assigned Decks */}
      <h2>Assigned Decks</h2>
      {assignments.length === 0 ? (
        <p>No decks assigned yet.</p>
      ) : (
        <div className={styles.grid}>
          {assignments.filter(a => !a.is_archived).map((a) => (
            <div key={a.id} className={styles.assignmentCard}>
              <h3>{a.flashy_decks?.name || a.custom_name || "Unnamed Deck"}</h3>
              <p>{a.flashy_decks?.description || ""}</p>
              <div className={styles.assignmentMeta}>
                <Badge>
                  {a.sync_enabled ? "Sync ON" : "Sync OFF"}
                </Badge>
                {a.allow_student_cards && (
                  <Badge>+ Cards</Badge>
                )}
                {a.allow_student_edit && (
                  <Badge>Edit</Badge>
                )}
                {a.deadline && (
                  <Badge>
                    Due: {new Date(a.deadline).toLocaleDateString()}
                  </Badge>
                )}
                <span>
                  Assigned: {new Date(a.assigned_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                <Button
                  callback={() => setSettingsModal({ open: true, assignment: a })}
                  bgcolor="transparent"
                  color="var(--fg)"
                >
                  <SettingsIcon /> Settings
                </Button>
                <Button
                  callback={() => fetchCards(a.id)}
                  bgcolor="transparent"
                  color="var(--fg)"
                >
                  {expandedCards[a.id] ? <><ChevUpIcon /> Hide Cards</> : <><ChevDownIcon /> View Cards</>}
                </Button>
                <Button
                  callback={() => window.open(`/students/${studentId}/cards/${a.id}`, '_blank')}
                  bgcolor="transparent"
                  color="var(--fg)"
                >
                  <ExternalLinkIcon /> Open in new tab
                </Button>
                <Button
                  callback={() => handleArchiveAssignment(a.id)}
                  bgcolor="transparent"
                  color="var(--fg-muted)"
                >
                  <ArchiveIcon /> Archive
                </Button>
                <Button
                  callback={() => handleDeleteAssignment(a.id, a.flashy_decks?.name || "this assignment")}
                  bgcolor="transparent"
                  color="var(--danger, #c00)"
                >
                  <TrashIcon /> Delete
                </Button>
              </div>

              {/* Expanded card list */}
              {expandedCards[a.id] === 'loading' && (
                <p style={{ fontSize: "0.8rem", color: "var(--fg-muted)", marginTop: "0.5rem" }}>Loading cards...</p>
              )}
              {Array.isArray(expandedCards[a.id]) && (
                <div style={{ marginTop: "0.5rem" }}>
                  {expandedCards[a.id].length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--fg-muted)" }}>No cards.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.35rem" }}>
                      {expandedCards[a.id].map((card) => (
                        <div
                          key={card.id}
                          style={{
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius)",
                            padding: "0.4rem",
                            fontSize: "0.75rem",
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            minHeight: "4.5rem",
                          }}
                        >
                          <div style={{ position: "absolute", top: "0.3rem", right: "0.3rem", display: "flex", gap: "0.15rem" }}>
                            {[
                              { icon: <EditIcon />, title: "Edit card", onClick: () => openEditCard(card, a.id) },
                              { icon: <ResetIcon />, title: "Reset progress", onClick: () => handleResetStudentCard(card.id, a.id) },
                              { icon: <TrashIcon />, title: "Delete card", onClick: () => handleDeleteStudentCard(card.id, a.id), danger: true },
                            ].map((btn, i) => (
                              <button
                                key={i}
                                onClick={btn.onClick}
                                title={btn.title}
                                style={{
                                  background: "transparent",
                                  border: "1px solid var(--border-color)",
                                  cursor: "pointer",
                                  opacity: 0.35,
                                  padding: "0.2rem",
                                  borderRadius: "var(--radius)",
                                  lineHeight: 0,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: btn.danger ? "var(--danger, #c00)" : "var(--fg-muted)",
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.borderColor = "var(--fg)"; }}
                                onMouseOut={(e) => { e.currentTarget.style.opacity = 0.35; e.currentTarget.style.borderColor = "var(--border-color)"; }}
                              >
                                {btn.icon}
                              </button>
                            ))}
                          </div>
                          <div style={{ fontWeight: 600, marginBottom: "0.25rem", paddingRight: "4.5rem" }}>{card.front}</div>
                          <div
                            style={{ color: "var(--fg-muted)" }}
                            dangerouslySetInnerHTML={{ __html: card.back }}
                          />
                          <div style={{ display: "flex", gap: "0.25rem", marginTop: "auto", paddingTop: "0.25rem", flexWrap: "wrap" }}>
                            {card.is_custom && <Badge style={{ fontSize: "0.6rem" }}>Custom</Badge>}
                            {card.mastered && <Badge style={{ fontSize: "0.6rem" }}>Mastered</Badge>}
                            {card.is_new && <Badge style={{ fontSize: "0.6rem" }}>New</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Archived Assignments */}
      {assignments.filter(a => a.is_archived).length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={() => setShowArchivedAssignments(!showArchivedAssignments)}
            style={{
              background: "none",
              border: "none",
              color: "var(--fg-muted)",
              cursor: "pointer",
              fontSize: "0.85rem",
              padding: "0.35rem 0",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showArchivedAssignments ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Archived assignments ({assignments.filter(a => a.is_archived).length})
          </button>
          {showArchivedAssignments && (
            <div className={styles.grid} style={{ marginTop: "0.5rem" }}>
              {assignments.filter(a => a.is_archived).map((a) => (
                <div key={a.id} className={styles.assignmentCard} style={{ opacity: 0.7 }}>
                  <h3>{a.flashy_decks?.name || a.custom_name || "Unnamed Deck"}</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--fg-muted)" }}>Archived</p>
                  <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <Button
                      callback={() => handleRestoreAssignment(a.id)}
                      bgcolor="transparent"
                      color="var(--fg)"
                    >
                      <RestoreIcon /> Restore
                    </Button>
                    <Button
                      callback={() => handleDeleteAssignment(a.id, a.flashy_decks?.name || "this assignment")}
                      bgcolor="transparent"
                      color="var(--danger, #c00)"
                    >
                      <TrashIcon /> Delete permanently
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Personal Decks */}
      <h2>Personal Decks</h2>
      {personalDecks.length === 0 ? (
        <p>No personal decks created by this student.</p>
      ) : (
        <div className={styles.grid}>
          {personalDecks.map((d) => (
            <div key={d.id} className={styles.assignmentCard}>
              <h3>{d.name || "Unnamed Deck"}</h3>
              <p>{d.description || ""}</p>
              <div className={styles.assignmentMeta}>
                <Badge>{d.flashy_cards?.length ?? 0} cards</Badge>
                <span>Created: {new Date(d.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                <Button
                  callback={() => fetchPersonalCards(d.id)}
                  bgcolor="transparent"
                  color="var(--fg)"
                >
                  {expandedPersonal[d.id] ? <><ChevUpIcon /> Hide Cards</> : <><ChevDownIcon /> View Cards</>}
                </Button>
                <Button
                  callback={() => handleArchivePersonalDeck(d.id)}
                  bgcolor="transparent"
                  color="var(--fg-muted)"
                >
                  <ArchiveIcon /> Archive
                </Button>
                <Button
                  callback={() => handleDeletePersonalDeck(d.id, d.name || "this deck")}
                  bgcolor="transparent"
                  color="var(--danger, #c00)"
                >
                  <TrashIcon /> Delete
                </Button>
              </div>

              {/* Expanded personal card list */}
              {expandedPersonal[d.id] === 'loading' && (
                <p style={{ fontSize: "0.8rem", color: "var(--fg-muted)", marginTop: "0.5rem" }}>Loading cards...</p>
              )}
              {Array.isArray(expandedPersonal[d.id]) && (
                <div style={{ marginTop: "0.5rem" }}>
                  {expandedPersonal[d.id].length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--fg-muted)" }}>No cards.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.35rem" }}>
                      {expandedPersonal[d.id].map((card) => (
                        <div
                          key={card.id}
                          style={{
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius)",
                            padding: "0.4rem",
                            fontSize: "0.75rem",
                            display: "flex",
                            flexDirection: "column",
                            minHeight: "4.5rem",
                            position: "relative",
                          }}
                        >
                          <div style={{ position: "absolute", top: "0.3rem", right: "0.3rem", display: "flex", gap: "0.15rem" }}>
                            {[
                              { icon: <EditIcon />, title: "Edit card", onClick: () => openEditPersonalCard(card, d.id) },
                              { icon: <TrashIcon />, title: "Delete card", onClick: () => handleDeletePersonalCard(card.id, d.id), danger: true },
                            ].map((btn, i) => (
                              <button
                                key={i}
                                onClick={btn.onClick}
                                title={btn.title}
                                style={{
                                  background: "transparent",
                                  border: "1px solid var(--border-color)",
                                  cursor: "pointer",
                                  opacity: 0.35,
                                  padding: "0.2rem",
                                  borderRadius: "var(--radius)",
                                  lineHeight: 0,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: btn.danger ? "var(--danger, #c00)" : "var(--fg-muted)",
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.borderColor = "var(--fg)"; }}
                                onMouseOut={(e) => { e.currentTarget.style.opacity = 0.35; e.currentTarget.style.borderColor = "var(--border-color)"; }}
                              >
                                {btn.icon}
                              </button>
                            ))}
                          </div>
                          <div style={{ fontWeight: 600, marginBottom: "0.25rem", paddingRight: "3rem" }}>{card.front}</div>
                          <div
                            style={{ color: "var(--fg-muted)" }}
                            dangerouslySetInnerHTML={{ __html: card.back }}
                          />
                          <div style={{ display: "flex", gap: "0.25rem", marginTop: "auto", paddingTop: "0.25rem", flexWrap: "wrap" }}>
                            {card.mastered && <Badge style={{ fontSize: "0.6rem" }}>Mastered</Badge>}
                            {card.is_new && <Badge style={{ fontSize: "0.6rem" }}>New</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Archived Personal Decks */}
      {archivedPersonalDecks.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={() => setShowArchivedPersonal(!showArchivedPersonal)}
            style={{
              background: "none",
              border: "none",
              color: "var(--fg-muted)",
              cursor: "pointer",
              fontSize: "0.85rem",
              padding: "0.35rem 0",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showArchivedPersonal ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Archived personal decks ({archivedPersonalDecks.length})
          </button>
          {showArchivedPersonal && (
            <div className={styles.grid} style={{ marginTop: "0.5rem" }}>
              {archivedPersonalDecks.map((d) => (
                <div key={d.id} className={styles.assignmentCard} style={{ opacity: 0.7 }}>
                  <h3>{d.name || "Unnamed Deck"}</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--fg-muted)" }}>Archived · {d.flashy_cards?.length ?? 0} cards</p>
                  <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <Button
                      callback={() => handleRestorePersonalDeck(d.id)}
                      bgcolor="transparent"
                      color="var(--fg)"
                    >
                      <RestoreIcon /> Restore
                    </Button>
                    <Button
                      callback={() => handleDeletePersonalDeck(d.id, d.name || "this deck")}
                      bgcolor="transparent"
                      color="var(--danger, #c00)"
                    >
                      <TrashIcon /> Delete permanently
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AssignmentSettingsModal
        open={settingsModal.open}
        setOpen={(v) => setSettingsModal((s) => ({ ...s, open: v }))}
        assignment={settingsModal.assignment}
        onUpdated={fetchData}
      />

      {/* Edit student card modal (assigned deck cards) */}
      <Modal open={editModal.open} setOpen={(v) => setEditModal(s => ({ ...s, open: v }))}>
        <h3>Edit Student Card</h3>
        <p className={styles.helperText}>
          Edit this card for this student only. Changes won't affect the master deck.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", margin: "0.75rem 0" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.2rem" }}>Front (term)</label>
            <textarea
              value={editFront}
              onChange={(e) => setEditFront(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                padding: "0.45rem",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius)",
                background: "var(--bg-secondary)",
                color: "var(--fg)",
                fontSize: "0.85rem",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.2rem" }}>Back (definition)</label>
            <RichTextInput
              value={editBack}
              onChange={setEditBack}
              multiline
              rows={4}
              placeholder="Definition..."
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.2rem" }}>Example sentence</label>
            <RichTextInput
              value={editExample}
              onChange={setEditExample}
              multiline
              rows={2}
              placeholder="Example sentence..."
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.2rem" }}>Notes</label>
            <RichTextInput
              value={editNotes}
              onChange={setEditNotes}
              multiline
              rows={2}
              placeholder="Teacher notes..."
            />
          </div>
        </div>
        <div className={styles.modalActions} style={{ gap: "0.5rem", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <Button
              callback={async () => {
                if (editModal.card) {
                  await handleDeleteStudentCard(editModal.card.id, editModal.assignmentId);
                  setEditModal({ open: false, card: null, assignmentId: null });
                }
              }}
              bgcolor="transparent"
              color="var(--danger, #c00)"
            >
              <TrashIcon /> Delete
            </Button>
            <Button
              callback={async () => {
                if (editModal.card) {
                  await handleResetStudentCard(editModal.card.id, editModal.assignmentId);
                  setEditModal({ open: false, card: null, assignmentId: null });
                }
              }}
              bgcolor="transparent"
              color="var(--fg-muted)"
            >
              <ResetIcon /> Reset
            </Button>
          </div>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <Button callback={() => setEditModal({ open: false, card: null, assignmentId: null })} bgcolor="transparent" color="var(--fg-muted)">Cancel</Button>
            <Button callback={handleSaveCardEdit} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save changes'}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit personal card modal */}
      <Modal open={editPersonalModal.open} setOpen={(v) => setEditPersonalModal(s => ({ ...s, open: v }))}>
        <h3>Edit Personal Card</h3>
        <p className={styles.helperText}>
          Edit this card in the student's personal deck.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", margin: "0.75rem 0" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.2rem" }}>Front (term)</label>
            <textarea
              value={editPersonalFront}
              onChange={(e) => setEditPersonalFront(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                padding: "0.45rem",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius)",
                background: "var(--bg-secondary)",
                color: "var(--fg)",
                fontSize: "0.85rem",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.2rem" }}>Back (definition)</label>
            <textarea
              value={editPersonalBack}
              onChange={(e) => setEditPersonalBack(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "0.45rem",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius)",
                background: "var(--bg-secondary)",
                color: "var(--fg)",
                fontSize: "0.85rem",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>
        <div className={styles.modalActions} style={{ gap: "0.5rem", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <Button
              callback={async () => {
                if (editPersonalModal.card) {
                  await handleDeletePersonalCard(editPersonalModal.card.id, editPersonalModal.deckId);
                  setEditPersonalModal({ open: false, card: null, deckId: null });
                }
              }}
              bgcolor="transparent"
              color="var(--danger, #c00)"
            >
              <TrashIcon /> Delete
            </Button>
          </div>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <Button callback={() => setEditPersonalModal({ open: false, card: null, deckId: null })} bgcolor="transparent" color="var(--fg-muted)">Cancel</Button>
            <Button callback={handleSavePersonalCardEdit} disabled={editPersonalSaving}>{editPersonalSaving ? 'Saving...' : 'Save changes'}</Button>
          </div>
        </div>
      </Modal>

      {/* Recent Study Sessions */}
      {recentSessions.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Recent Study Sessions</h2>
            <Button
              callback={() => exportStudySessionsCsv(recentSessions, student.display_name || student.email || student.id)}
              bgcolor="transparent"
              color="var(--fg)"
            >
              Export CSV
            </Button>
          </div>
          <p style={{ color: 'var(--fg-muted)', fontSize: '0.8rem', margin: '0.35rem 0 0.55rem' }}>
            Session history is retained for 30 days.
          </p>
          <div className={styles.sessionsList}>
            {recentSessions.map((s) => (
              <div
                key={s.id}
                className={styles.sessionRow}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(130px, 1fr) minmax(90px, 0.7fr) minmax(180px, 2fr) auto',
                  alignItems: 'center',
                  gap: '0.55rem',
                }}
              >
                <span>
                  {new Date(s.started_at).toLocaleDateString()} {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>{s.session_type || s.mode || 'study'}</span>
                <span>
                  {s.deck_name || 'Deck'} · {s.cards_studied} cards · {s.cards_correct ?? s.correct_count ?? 0}/{s.cards_studied} correct
                </span>
                <Badge style={{ fontSize: '0.65rem' }}>{sessionRetentionLabel(s)}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
    <ConfirmModal
      open={confirmState.open}
      title="Confirm"
      message={confirmState.message}
      confirmLabel="Delete"
      danger={confirmState.danger}
      onConfirm={async () => {
        setConfirmState(s => ({ ...s, open: false }));
        await confirmState.action?.();
      }}
      onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
    />
    </>
  );
};

export default StudentDetailPage;
