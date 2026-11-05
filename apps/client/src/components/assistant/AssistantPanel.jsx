import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Collapse,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import RestaurantMenuRoundedIcon from '@mui/icons-material/RestaurantMenuRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TableRestaurantOutlinedIcon from '@mui/icons-material/TableRestaurantOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { PackagePhoto } from '@tm/shared';
import { BUSINESS } from '@tm/shared/services/config.js';
import {
  ASSISTANT_AUTH,
  ASSISTANT_QUESTIONS,
  ASSISTANT_TEXT_MAX,
  cleanAssistantIntent
} from '@tm/shared/domain/assistant.js';
import {
  assistantApi,
  canOpenAssistantSession,
  createAssistantDraftWriter,
  readAssistantDraft,
  takeGuestAssistantDraft
} from '../../lib/assistantApi.js';
import { startQuestionRecording } from '../../lib/assistantAudio.js';
import { carryAssistantPhotos } from '../../lib/assistantBookingHandoff.js';
import { readDraft, saveAssistantIntent } from '../../lib/booking.js';
import { useAuth } from '../../auth.js';
import AssistantMascot from './AssistantMascot.jsx';
import AssistantBookingPlan from './AssistantBookingPlan.jsx';
import AssistantReservationFlow from './AssistantReservationFlow.jsx';
import PackagePlanningPanel from './PackagePlanningPanel.jsx';
import { assistantBookingSummary } from '@tm/shared/domain/assistantBooking.js';
import './assistantPanel.css';

const questionCards = [
  { title: 'Find my package', icon: GroupsOutlinedIcon },
  { title: 'Compare services', icon: RestaurantMenuRoundedIcon },
  { title: 'What’s included?', icon: TableRestaurantOutlinedIcon },
  { title: 'Explore rentals', icon: Inventory2OutlinedIcon },
  { title: 'How to book', icon: ChatBubbleOutlineRoundedIcon },
  { title: 'Check a date', icon: EventAvailableOutlinedIcon }
];

const pesoFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const peso = (value) => pesoFormatter.format(Number(value) || 0);

export default function AssistantPanel({
  initialQuestion = '',
  onClose,
  packagePlanning = false,
  proposalId = '',
  onConversationChange,
  fullPage = false,
  onShowDetails,
  savedDetailsCount = 0,
  totalDetailsCount = 8
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState(null);
  const [conversation, setConversation] = useState(null);
  useEffect(() => {
    onConversationChange?.(conversation);
  }, [conversation, onConversationChange]);
  const [text, setText] = useState(() => initialQuestion || readAssistantDraft(user?.id)?.text || '');
  const [source, setSource] = useState('text');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [playing, setPlaying] = useState('');
  const [speechLoading, setSpeechLoading] = useState('');
  const [intent, setIntent] = useState(null);
  const [intentSummary, setIntentSummary] = useState([]);
  const [resumeReview, setResumeReview] = useState(false);
  const savedForm = useMemo(() => (user?.id ? readDraft(user.id)?.form : null), [user?.id]);
  const [moreQuestions, setMoreQuestions] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const alive = useRef(false);
  const controller = useRef(null);
  const recorder = useRef(null);
  const audio = useRef(null);
  const urls = useRef(new Map());
  const inFlight = useRef(false);
  const retry = useRef(null);
  const end = useRef(null);
  const latestReply = useRef(null);
  const lastScrolledReply = useRef('');
  const openedConversation = useRef('');
  const scope = user?.id || 'guest';
  const draftWriter = useMemo(() => createAssistantDraftWriter(user?.id), [scope]);
  const remaining = conversation?.allowance.remaining ?? (user ? settings?.dailyLimit : 2);
  const blocked = remaining === 0;
  const canSend = Boolean(
    settings?.available &&
    conversation &&
    !blocked &&
    !busy &&
    !loading &&
    !recording &&
    !conversation.submittedRef &&
    !conversation.allowance.pending
  );

  const stopPlayback = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setPlaying('');
  }, []);
  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.hidden) draftWriter.flush();
    };
    window.addEventListener('pagehide', draftWriter.flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', draftWriter.flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      draftWriter.flush();
    };
  }, [draftWriter]);
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    controller.current = abort;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const config = await assistantApi.config(abort.signal);
        if (!alive.current) return;
        setSettings(config);
        if (canOpenAssistantSession(config, user?.id)) {
          const session = await assistantApi.open(user?.id, abort.signal);
          if (!alive.current) return;
          setConversation(session);
          const draft = readAssistantDraft(user?.id) || (user ? takeGuestAssistantDraft() : null);
          if (!initialQuestion && draft?.text) {
            setText(draft.text);
            setSource(draft.source || 'text');
            retry.current = draft.requestId ? draft : null;
          }
        }
      } catch (failure) {
        if (alive.current && failure.name !== 'AbortError') setError(failure.message);
      } finally {
        if (alive.current) setLoading(false);
      }
    }
    void load();
    return () => {
      alive.current = false;
      abort.abort();
      void recorder.current?.cancel();
      recorder.current = null;
      audio.current?.pause();
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
    };
  }, [scope, attempt]);
  useEffect(() => {
    if (fullPage) {
      if (!conversation || busy || loading) return;
      const opening = openedConversation.current !== conversation.conversationId;
      openedConversation.current = conversation.conversationId;
      const message = conversation?.messages.at(-1);
      if (!message) return;
      const key = `${message.id}:${message.status}`;
      if (lastScrolledReply.current === key) return;
      // Restoring a plan keeps its guided form in view; newly answered questions open at the reply.
      if (opening && conversation.bookingDraft?.planningStarted) {
        lastScrolledReply.current = key;
        return;
      }
      const frame = requestAnimationFrame(() => {
        latestReply.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
        lastScrolledReply.current = key;
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!conversation?.bookingDraft?.planningStarted && (conversation?.messages.length || busy))
      end.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [
    conversation?.conversationId,
    conversation?.messages.length,
    conversation?.messages.at(-1)?.status,
    busy,
    loading,
    fullPage
  ]);
  useEffect(() => {
    if (!recording) return undefined;
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.min(30, Math.floor((Date.now() - start) / 1000))), 250);
    return () => clearInterval(timer);
  }, [recording]);

  const play = useCallback(
    async (messageId) => {
      stopPlayback();
      setError('');
      try {
        let url = urls.current.get(messageId);
        if (!url) {
          setSpeechLoading(messageId);
          const blob = await assistantApi.speech(conversation.conversationId, messageId, controller.current.signal);
          if (!alive.current) return;
          url = URL.createObjectURL(blob);
          urls.current.set(messageId, url);
        }
        const player = new Audio(url);
        audio.current = player;
        player.onended = () => {
          if (alive.current) setPlaying('');
        };
        player.onerror = () => {
          if (alive.current) {
            setPlaying('');
            setError('Audio could not be played. The written answer is available below.');
          }
        };
        await player.play();
        if (alive.current) setPlaying(messageId);
      } catch (failure) {
        if (alive.current && failure.name !== 'AbortError')
          setError('Voice playback is unavailable. You can read the answer or tap Listen to try again.');
      } finally {
        if (alive.current) setSpeechLoading('');
      }
    },
    [conversation?.conversationId, stopPlayback]
  );

  async function send(event) {
    event.preventDefault();
    if (!canSend || !text.trim() || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    stopPlayback();
    const draft =
      retry.current?.text === text.trim()
        ? retry.current
        : { text: text.trim(), source, requestId: crypto.randomUUID() };
    retry.current = draft;
    draftWriter.write(draft);
    try {
      const updated = await assistantApi.send(conversation.conversationId, draft, controller.current.signal);
      if (!alive.current) return;
      setConversation(updated);
      setText('');
      setSource('text');
      retry.current = null;
      draftWriter.write(null);
      if (speakReplies && settings.voiceAvailable) {
        const answer = updated.messages.find((m) => m.requestId === draft.requestId);
        if (answer?.status === 'completed') void play(answer.id);
      }
    } catch (failure) {
      if (alive.current && failure.name !== 'AbortError') {
        setError(failure.message);
        try {
          setConversation(await assistantApi.read(conversation.conversationId, controller.current.signal));
        } catch {
          /* Keep the draft and current answers. */
        }
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function record() {
    if (recording) {
      await recorder.current?.stop();
      return;
    }
    if (!canSend || !settings.voiceAvailable) return;
    setBusy(true);
    setError('');
    stopPlayback();
    try {
      const capture = await startQuestionRecording(async (blob) => {
        if (!alive.current) return;
        recorder.current = null;
        setRecording(false);
        setBusy(true);
        try {
          const result = await assistantApi.transcribe(conversation.conversationId, blob, controller.current.signal);
          if (alive.current) {
            setText(result.text);
            setSource('voice');
            setSpeakReplies(true);
            draftWriter.write({ text: result.text, source: 'voice' });
          }
        } catch (failure) {
          if (alive.current && failure.name !== 'AbortError') setError(failure.message);
        } finally {
          if (alive.current) setBusy(false);
        }
      });
      if (!alive.current) {
        await capture.cancel();
        return;
      }
      recorder.current = capture;
      setSeconds(0);
      setRecording(true);
    } catch {
      if (alive.current) setError('Microphone access is unavailable. Allow it in your browser or type your question.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const changeText = useCallback(
    (value) => {
      setText(value);
      setSource('text');
      draftWriter.schedule({ text: value, source: 'text' });
    },
    [draftWriter]
  );
  const review = useCallback((value, summary) => {
    const draft = cleanAssistantIntent(value);
    setIntent(draft);
    setIntentSummary(summary || assistantBookingSummary(draft));
  }, []);
  const reviewPlan = useCallback(async () => {
    if (!conversation?.bookingPlan || busy || recording) return;
    setBusy(true);
    setError('');
    try {
      const updated = await assistantApi.validateBooking(
        conversation.conversationId,
        conversation.bookingPlan.draft,
        conversation.draftRevision,
        controller.current.signal
      );
      if (alive.current) setConversation(updated);
      await carryAssistantPhotos(updated, user?.id, { signal: controller.current.signal });
      if (alive.current) {
        setConversation(updated);
        review(updated.bookingPlan.draft, updated.bookingPlan.summary);
      }
    } catch (failure) {
      if (alive.current && failure.name !== 'AbortError') setError(failure.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [conversation, busy, recording, review, user?.id]);
  const resumeSaved = useCallback(async () => {
    if (!savedForm || !conversation || busy || recording) return;
    setBusy(true);
    setError('');
    try {
      const updated = await assistantApi.resumeBooking(
        conversation.conversationId,
        savedForm,
        conversation.draftRevision || 0,
        controller.current.signal
      );
      if (alive.current) {
        setConversation(updated);
        setResumeReview(false);
      }
    } catch (failure) {
      if (alive.current && failure.name !== 'AbortError') setError(failure.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [savedForm, conversation, busy, recording]);
  const proceed = () => {
    saveAssistantIntent(intent, user?.id);
    setIntent(null);
    navigate(user ? '/portal/book' : '/signup?continue=booking');
  };

  const header = useMemo(
    () => (
      <Box component="header" className="tm-assistant-header">
        <Box className="tm-assistant-header__main">
          <Box className="tm-assistant-header__avatar">
            {fullPage ? <AutoAwesomeOutlinedIcon aria-hidden="true" /> : <AssistantMascot portrait />}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography className="tm-assistant-eyebrow">TRES MARIAS</Typography>
            <Typography component="h2" id="assistant-panel-title" className="tm-assistant-header__title">
              {fullPage ? 'Your planning companion' : 'AI event assistant'}
            </Typography>
          </Box>
          <Tooltip title="Refresh conversation">
            <span>
              <IconButton
                aria-label="Refresh conversation"
                onClick={() => setAttempt((n) => n + 1)}
                disabled={busy || recording || loading}
                size="small"
              >
                <RefreshRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {onClose && (
            <IconButton aria-label="Close AI assistant" onClick={onClose} size="small">
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
        <Box className="tm-assistant-header__meta">
          {!fullPage && <Typography className="tm-assistant-header__hint">Packages · Prices · Dates</Typography>}
          <Box component="span" className="tm-assistant-allowance">
            {user
              ? `${remaining ?? '…'} questions remaining today`
              : `${remaining ?? 2} free ${remaining === 1 ? 'question' : 'questions'} remaining`}
          </Box>
          {fullPage && onShowDetails && (
            <Button
              className="tm-assistant-details-toggle"
              startIcon={<TuneRoundedIcon />}
              onClick={onShowDetails}
              aria-haspopup="dialog"
            >
              Event details
              <Box component="span" className="tm-assistant-details-count">
                {savedDetailsCount}/{totalDetailsCount}
              </Box>
            </Button>
          )}
        </Box>
      </Box>
    ),
    [remaining, user, busy, recording, loading, onClose, fullPage, onShowDetails, savedDetailsCount, totalDetailsCount]
  );

  const thread = useMemo(
    () => (
      <Box
        className="tm-assistant-thread"
        data-assistant-thread
        tabIndex={fullPage ? undefined : 0}
        aria-label="Assistant workspace"
      >
        <Box className="tm-assistant-thread__content">
          {savedForm && conversation && (
            <Box className="tm-assistant-plan tm-assistant-plan--resume">
              <Box className="tm-assistant-plan__body">
                <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }}>
                  Already started a reservation? You can bring your saved form into this conversation.
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                  Review copied defaults and incomplete details. No request is submitted.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                sx={{ flexShrink: 0 }}
                disabled={busy || recording || loading}
                onClick={() => (conversation.bookingPlan?.canReview ? setResumeReview(true) : void resumeSaved())}
              >
                Resume saved reservation
              </Button>
            </Box>
          )}
          {loading && (
            <Stack direction="row" spacing={1} alignItems="center" role="status">
              <CircularProgress size={18} />
              <Typography variant="body2">Opening your assistant…</Typography>
            </Stack>
          )}
          {!loading && !settings?.available && (
            <Box role="status" className="tm-assistant-offline">
              <InfoOutlinedIcon sx={{ fontSize: 18, flexShrink: 0 }} />
              <Box>
                <Typography component="p" sx={{ fontSize: 12, fontWeight: 600 }}>
                  {user
                    ? 'AI replies and package generation are temporarily unavailable'
                    : 'Assistant is temporarily unavailable'}
                </Typography>
                <Typography component="p" sx={{ fontSize: 11.5, lineHeight: 1.6 }}>
                  {user
                    ? 'You can still save answers, complete the guided planning controls and manage reference photos. Your written question stays saved until AI replies are available again.'
                    : 'Browse our packages or contact the team below.'}
                </Typography>
              </Box>
            </Box>
          )}
          {!packagePlanning &&
            conversation?.bookingDraft?.planningMode !== 'custom' &&
            !conversation?.messages.length &&
            !conversation?.bookingPlan?.canReview && (
              <>
                <Box className="tm-assistant-welcome">
                  <Box className="tm-assistant-welcome__badge">
                    <AutoAwesomeOutlinedIcon sx={{ fontSize: 17 }} />
                    <Typography component="span">A little help for your big day</Typography>
                  </Box>
                  <Typography component="h3">
                    {fullPage ? (
                      <>
                        Good celebrations start
                        <br />
                        with a conversation.
                      </>
                    ) : (
                      <>
                        Let’s plan something
                        <br />
                        worth celebrating.
                      </>
                    )}
                  </Typography>
                  <Typography component="p">
                    {fullPage
                      ? 'Tell us what you have in mind. We’ll help you explore packages, work out the details, and find your next step.'
                      : 'Find your package, explore ideas, or ask where to begin.'}
                  </Typography>
                </Box>
                <Box className="tm-assistant-questions">
                  {(settings?.questions || ASSISTANT_QUESTIONS)
                    .slice(0, moreQuestions ? undefined : 4)
                    .map((question) => {
                      const card = questionCards[ASSISTANT_QUESTIONS.indexOf(question)] || {
                        title: 'Explore your options',
                        icon: AutoAwesomeOutlinedIcon
                      };
                      const Icon = card.icon;
                      return (
                        <Button
                          key={question}
                          aria-label={question}
                          className="tm-assistant-question"
                          disabled={loading || !settings?.available || blocked || busy || recording}
                          onClick={() => changeText(question)}
                        >
                          <Box className="tm-assistant-question__top">
                            <Icon sx={{ fontSize: 19 }} />
                            <ArrowForwardRoundedIcon sx={{ fontSize: 15 }} />
                          </Box>
                          <Typography component="span" className="tm-assistant-question__title">
                            {card.title}
                          </Typography>
                          <Typography component="span" className="tm-assistant-question__text">
                            {question}
                          </Typography>
                        </Button>
                      );
                    })}
                </Box>
                {(settings?.questions || ASSISTANT_QUESTIONS).length > 4 && (
                  <Button
                    size="small"
                    className="tm-assistant-more"
                    onClick={() => setMoreQuestions((value) => !value)}
                  >
                    {moreQuestions ? 'Fewer suggestions' : 'More questions to explore'}
                    <ArrowForwardRoundedIcon sx={{ fontSize: 14, ml: 0.75 }} />
                  </Button>
                )}
              </>
            )}
          <Box role="log" aria-label="Assistant conversation" aria-live="polite" aria-relevant="additions text">
            {conversation?.messages.map((message, index) => (
              <Box key={message.id} sx={{ mb: 3 }}>
                <Box className="tm-assistant-message tm-assistant-message--user">
                  <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.72 }}>
                    You{message.source === 'voice' ? ' · voice transcript' : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {message.text}
                  </Typography>
                </Box>
                {message.response && (
                  <Box
                    className="tm-assistant-message tm-assistant-message--reply"
                    ref={index === conversation.messages.length - 1 ? latestReply : undefined}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: '#8a6a2f', fontWeight: 600, display: 'flex', gap: 0.75, alignItems: 'center' }}
                    >
                      <AutoAwesomeOutlinedIcon sx={{ fontSize: 14 }} />
                      Tres Marias assistant
                    </Typography>
                    {fullPage ? (
                      <Box className="tm-assistant-answer">
                        {message.response.answer
                          .split(/\n\s*\n/)
                          .filter(Boolean)
                          .map((paragraph, paragraphIndex) => (
                            <Typography component="p" variant="body2" key={paragraphIndex}>
                              {paragraph}
                            </Typography>
                          ))}
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 0.5, lineHeight: 1.8 }}
                      >
                        {message.response.answer}
                      </Typography>
                    )}
                    {settings?.voiceAvailable && (
                      <Button
                        size="small"
                        startIcon={
                          speechLoading === message.id ? (
                            <CircularProgress size={14} />
                          ) : playing === message.id ? (
                            <StopRoundedIcon />
                          ) : (
                            <VolumeUpOutlinedIcon />
                          )
                        }
                        disabled={Boolean(speechLoading)}
                        onClick={() => (playing === message.id ? stopPlayback() : void play(message.id))}
                      >
                        {playing === message.id ? 'Stop voice' : 'Listen'}
                      </Button>
                    )}
                    {message.response.packageProposals?.map((proposal) => (
                      <Card key={proposal.id} variant="outlined" sx={{ my: 2, borderRadius: 2 }}>
                        <CardContent>
                          <Typography variant="subtitle2">Your custom package options</Typography>
                          <Typography variant="body2" sx={{ my: 1 }}>
                            {proposal.options?.length || 0} complete options ·{' '}
                            {proposal.status === 'ready'
                              ? 'Ready to review'
                              : proposal.status === 'no-options'
                                ? 'No matching setup yet'
                                : 'Generation unavailable'}
                          </Typography>
                          <Button
                            component={RouterLink}
                            to={`/portal/package-proposals/${encodeURIComponent(proposal.id)}?conversation=${encodeURIComponent(conversation.conversationId)}`}
                            variant="outlined"
                            size="small"
                          >
                            Review package options
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                    {message.response.packages
                      ?.filter((p) => /^[a-z0-9-]+$/.test(p.slug))
                      .map((pkg) => (
                        <Card
                          key={pkg.id}
                          variant="outlined"
                          sx={{ mt: 1.5, borderRadius: 3, borderColor: '#e8dcc6', boxShadow: 'none' }}
                        >
                          <PackagePhoto pkg={pkg} height={120} thumbnail />
                          <CardContent sx={{ p: 2 }}>
                            <Typography variant="subtitle2">{pkg.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {pkg.description}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                              <Button size="small" component={RouterLink} to={`/packages/${pkg.slug}`}>
                                View package
                              </Button>
                              <Button size="small" onClick={() => review({ packageSlug: pkg.slug })}>
                                Continue to booking
                              </Button>
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    {message.response.estimates?.map((estimate) => (
                      <Card
                        key={estimate.id}
                        variant="outlined"
                        sx={{ mt: 1.5, borderRadius: 3, borderColor: '#e8dcc6', boxShadow: 'none' }}
                      >
                        <CardContent sx={{ p: 2 }}>
                          <Typography variant="subtitle2">
                            {estimate.packageName}
                            {estimate.guests ? ` · ${estimate.guests} guests` : ''}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {estimate.serviceType}
                          </Typography>
                          {estimate.lines.map((line) => (
                            <Stack
                              key={line.name}
                              direction="row"
                              justifyContent="space-between"
                              spacing={1}
                              sx={{ mt: 0.75 }}
                            >
                              <Typography variant="body2">{line.name}</Typography>
                              <Typography variant="body2">{peso(line.amount)}</Typography>
                            </Stack>
                          ))}
                          <Typography sx={{ mt: 1.5, fontWeight: 700 }}>
                            Known estimate: {peso(estimate.knownSubtotal)}
                          </Typography>
                          {estimate.pendingQuotation.length > 0 && (
                            <Alert severity="info" sx={{ mt: 1 }}>
                              To be reviewed or quoted: {estimate.pendingQuotation.join('; ')}.
                            </Alert>
                          )}
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                            {estimate.note}
                          </Typography>
                          <Button size="small" onClick={() => review(estimate.intent, estimate.summary)} sx={{ mt: 1 }}>
                            Continue to booking
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                    {message.response.needsAdmin && (
                      <Button
                        size="small"
                        component={RouterLink}
                        to={user ? '/portal/messages' : ASSISTANT_AUTH.signup}
                        sx={{ mt: 1 }}
                      >
                        {user ? 'Message admin' : 'Create an account to message admin'}
                      </Button>
                    )}
                  </Box>
                )}
                {message.status === 'pending' && (
                  <Typography variant="body2" role="status">
                    Your answer is being prepared. Refresh the conversation to check its progress.
                  </Typography>
                )}
                {message.status === 'failed' && (
                  <Typography variant="caption" color="text.secondary">
                    No answer was completed. This question did not use your allowance.
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
          {conversation && (
            <PackagePlanningPanel
              conversation={conversation}
              disabled={busy || recording || loading || conversation.allowance.pending}
              onChange={setConversation}
              onBusyChange={setBusy}
              requested={packagePlanning}
              proposalId={proposalId}
              generationAvailable={Boolean(settings?.available)}
            />
          )}
          {conversation &&
            ((conversation.bookingDraft?.planningMode !== 'custom' && !packagePlanning) ||
              conversation.selectedPackageProposal) && (
              <AssistantReservationFlow
                conversation={conversation}
                user={user}
                disabled={busy || recording || loading || conversation.allowance.pending}
                onChange={setConversation}
                onBusyChange={setBusy}
                onFormReview={() => void reviewPlan()}
              />
            )}
          {!packagePlanning &&
            conversation?.bookingDraft?.planningMode !== 'custom' &&
            !conversation?.bookingDraft?.planningStarted &&
            !conversation?.submittedRef && (
              <AssistantBookingPlan
                plan={conversation?.bookingPlan}
                disabled={busy || recording || loading || conversation?.allowance.pending}
                onReview={() => void reviewPlan()}
                onEdit={() => changeText('I would like to change these reservation details: ')}
              />
            )}
          {busy && !recording && (
            <Typography variant="body2" role="status" sx={{ mt: 1 }}>
              <CircularProgress size={14} sx={{ mr: 1 }} />
              Please wait…
            </Typography>
          )}
          {blocked && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {user
                ? 'Your daily assistant allowance has been reached. You can still browse packages or message the admin.'
                : 'You have used your two free questions. Create a free account or log in to continue.'}
              {!user && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button component={RouterLink} to={ASSISTANT_AUTH.signup} variant="contained" size="small">
                    Create account
                  </Button>
                  <Button component={RouterLink} to={ASSISTANT_AUTH.login} size="small">
                    Log in
                  </Button>
                </Stack>
              )}
            </Alert>
          )}
          {error && !fullPage && (
            <Alert severity="warning" sx={{ mt: 2 }} role="alert">
              {error}
            </Alert>
          )}
          <Box ref={end} />
        </Box>
      </Box>
    ),
    [
      loading,
      settings,
      conversation,
      moreQuestions,
      blocked,
      busy,
      recording,
      user,
      changeText,
      review,
      play,
      stopPlayback,
      playing,
      speechLoading,
      error,
      savedForm,
      reviewPlan,
      resumeSaved,
      packagePlanning,
      proposalId,
      fullPage
    ]
  );

  return (
    <Box className={`tm-assistant-panel${fullPage ? ' tm-assistant-panel--page' : ''}`}>
      {header}
      {thread}
      <Box component="form" onSubmit={send} className="tm-assistant-composer">
        <Box className="tm-assistant-composer__content">
          {fullPage && error && (
            <Alert severity="warning" sx={{ mb: 1 }} role="alert">
              {error}
            </Alert>
          )}
          {recording && (
            <Stack direction="row" spacing={1} alignItems="center" role="status" sx={{ mb: 1 }}>
              <Chip color="error" size="small" label={`Recording · ${seconds}/30s`} />
              <Button
                size="small"
                onClick={() => {
                  void recorder.current?.cancel();
                  recorder.current = null;
                  setRecording(false);
                }}
              >
                Cancel recording
              </Button>
            </Stack>
          )}
          {source === 'voice' && text && (
            <Typography variant="caption" display="block" sx={{ mb: 1 }}>
              Review the transcript, especially dates, names and amounts, then send.
            </Typography>
          )}
          <Box className="tm-assistant-composer__field">
            <TextField
              placeholder="Ask about your celebration…"
              className="tm-assistant-composer__input"
              multiline
              name="assistant-question"
              minRows={1}
              maxRows={4}
              fullWidth
              value={text}
              disabled={
                !settings?.available || blocked || busy || recording || loading || conversation?.allowance.pending
              }
              onChange={(event) => changeText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229)
                  return;
                event.preventDefault();
                if (!event.repeat) event.currentTarget.closest('form')?.requestSubmit();
              }}
              slotProps={{ htmlInput: { maxLength: ASSISTANT_TEXT_MAX, 'aria-label': 'Your question' } }}
              inputProps={{ maxLength: ASSISTANT_TEXT_MAX, 'aria-label': 'Your question' }}
            />
            <Box className="tm-assistant-composer__toolbar">
              <Tooltip title={settings?.voiceAvailable ? 'Record a voice question' : 'Voice is currently unavailable'}>
                <span>
                  <IconButton
                    aria-label={recording ? 'Stop recording' : 'Record a voice question'}
                    className={`tm-assistant-mic${recording ? ' tm-assistant-mic--recording' : ''}`}
                    disabled={!recording && (!canSend || !settings?.voiceAvailable)}
                    onClick={() => void record()}
                  >
                    {recording ? <StopRoundedIcon /> : <MicNoneRoundedIcon />}
                  </IconButton>
                </span>
              </Tooltip>
              <Typography component="span" className="tm-assistant-composer__hint">
                {recording
                  ? 'Listening…'
                  : fullPage
                    ? 'Enter to send · Shift + Enter for a new line'
                    : settings?.voiceAvailable
                      ? 'Type or use your voice'
                      : 'Your event starts with a question'}
              </Typography>
              <IconButton
                type="submit"
                aria-label="Send question"
                className="tm-assistant-send"
                disabled={!canSend || !text.trim()}
              >
                <ArrowForwardRoundedIcon />
              </IconButton>
            </Box>
          </Box>
          <Box className="tm-assistant-composer__meta-bar">
            <Box className="tm-assistant-composer__options">
              {settings?.voiceAvailable ? (
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={speakReplies}
                      onChange={(event) => setSpeakReplies(event.target.checked)}
                    />
                  }
                  label={<Typography sx={{ fontSize: 11 }}>Read replies aloud</Typography>}
                />
              ) : (
                <Typography sx={{ fontSize: 11 }}>AI-powered · Conversations last 24h</Typography>
              )}
              <Button
                size="small"
                aria-expanded={showAbout}
                aria-controls="assistant-about"
                startIcon={<InfoOutlinedIcon sx={{ fontSize: 14 }} />}
                onClick={() => setShowAbout((value) => !value)}
              >
                About
              </Button>
            </Box>
            <Box className="tm-assistant-footer-links">
              <Button
                size="small"
                startIcon={<Inventory2OutlinedIcon />}
                component={RouterLink}
                to={user ? '/portal/packages' : '/#packages'}
                onClick={onClose}
              >
                Browse packages
              </Button>
              <Button
                size="small"
                startIcon={<ChatBubbleOutlineRoundedIcon />}
                component={user ? RouterLink : 'a'}
                {...(user ? { to: '/portal/messages' } : { href: `tel:${BUSINESS.phone.replace(/[^+\d]/g, '')}` })}
              >
                {user ? 'Message admin' : 'Contact Tres Marias'}
              </Button>
            </Box>
            {!fullPage && (
              <Typography className="tm-assistant-disclosure">
                Messages &amp; audio are processed by an external AI service.
              </Typography>
            )}
          </Box>
          <Collapse in={showAbout}>
            <Typography id="assistant-about" className="tm-assistant-about">
              Messages and recordings are processed by an external AI service. Conversations expire after 24 hours.
              Voice replies are AI-generated. Final arrangements are confirmed by our admin.
            </Typography>
          </Collapse>
        </Box>
      </Box>
      <Dialog open={resumeReview} onClose={() => setResumeReview(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Resume saved reservation?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This replaces the current conversation plan with your latest saved reservation form. Your form stays saved,
            and no request is submitted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResumeReview(false)}>Keep current plan</Button>
          <Button variant="contained" disabled={busy} onClick={() => void resumeSaved()}>
            Use saved form
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(intent)} onClose={() => setIntent(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Review booking selections</DialogTitle>
        <DialogContent>
          {intent && (
            <Stack spacing={1}>
              {intentSummary.map((row) => (
                <Typography key={row.label} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  <strong>{row.label}:</strong> {row.value}
                </Typography>
              ))}
            </Stack>
          )}
          <Typography variant="body2" sx={{ mt: 2 }}>
            Review your menu, additional services and other event details in the booking form. No reservation has been
            submitted.
          </Typography>
          {user && readDraft(user.id)?.form && (
            <Alert severity="info" sx={{ mt: 2 }}>
              You have a saved booking draft. Only the selections listed above will be replaced; review them before
              continuing.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIntent(null)}>Keep chatting</Button>
          <Button variant="contained" onClick={proceed}>
            {user ? 'Use selections' : 'Create account and continue'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
