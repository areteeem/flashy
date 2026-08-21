import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import Button from "../../common/components/Button";
import LoadingScreen from "../../common/components/LoadingScreen";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { applyStudentAppBridge, storeStudentAppBridge } from "../../lib/studentAppBridge";
import { normalizeStudentId } from "../../lib/tutproRoster";
import styles from "./StudentLaunchPage.module.css";

const parseLaunchParams = (search) => {
  const params = new URLSearchParams(search);
  const teacherId = String(params.get("teacherId") || "").trim();
  const studentId = normalizeStudentId(params.get("studentId"));
  const studentName = String(params.get("studentName") || "").trim();
  const rawRedirect = String(params.get("redirect") || "").trim();
  const redirectPath = rawRedirect && rawRedirect.startsWith("/") ? rawRedirect : "/";

  return {
    teacherId,
    studentId,
    studentName,
    redirectPath,
    valid: Boolean(teacherId && studentId && studentName),
  };
};

const getFriendlyError = (error) => {
  const message = String(error?.message || "").trim();
  if (!message) {
    return "TutPro could not start a student session.";
  }

  if (message.toLowerCase().includes("anonymous")) {
    return "Anonymous sign-in is disabled in Supabase. Enable it to use student-app auto login.";
  }

  return message;
};

const StudentLaunchPage = () => {
  const { user, isTeacher, signInStudent } = useAuth();
  const location = useLocation();
  const launchData = useMemo(() => parseLaunchParams(location.search), [location.search]);
  const startedRef = useRef(false);
  const [status, setStatus] = useState("Preparing your flashcards...");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!launchData.valid) {
      setError("This launch link is missing student details.");
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    const startStudentSession = async () => {
      if (isTeacher) {
        setError("A teacher account is already open in this browser. Use a student browser or sign out first.");
        return;
      }

      try {
        storeStudentAppBridge(launchData);
        setStatus("Connecting to TutPro...");

        let activeUser = user;

        if (!activeUser) {
          const authData = await signInStudent(
            launchData.studentName,
            launchData.studentId,
          );

          activeUser = authData?.user || authData?.session?.user || null;
        }

        if (!activeUser?.id) {
          const { data: sessionData } = await supabase.auth.getSession();
          activeUser = sessionData?.session?.user || null;
        }

        if (!activeUser?.id) {
          throw new Error("Could not start a student session.");
        }

        setStatus("Linking your student profile...");
        await applyStudentAppBridge(launchData);

        toast.success(`Ready to study, ${launchData.studentName}!`);
        window.location.replace(new URL(
          String(launchData.redirectPath || "/").replace(/^\//, ""),
          `${window.location.origin}${import.meta.env.BASE_URL}`,
        ).toString());
      } catch (err) {
        setError(getFriendlyError(err));
      }
    };

    startStudentSession();
  }, [isTeacher, launchData, signInStudent, user]);

  return (
    <div className={styles.layout}>
      <div className={styles.card}>
        {!error ? (
          <>
            <div className={styles.loaderWrap}>
              <LoadingScreen />
            </div>
            <h1 className={styles.title}>Opening your flashcards</h1>
            <p className={styles.description}>{status}</p>
          </>
        ) : (
          <>
            <span className={styles.badge}>Student launch</span>
            <h1 className={styles.title}>Could not open TutPro</h1>
            <p className={styles.description}>{error}</p>
            <div className={styles.actions}>
              <Button callback={() => window.location.reload()}>Try again</Button>
              <Link className={styles.linkButton} to="/signin">
                Open sign in
              </Link>
              <Link className={styles.secondaryLink} to="/">
                Back home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentLaunchPage;
