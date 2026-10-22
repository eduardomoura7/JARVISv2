import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Device,
  AgendaEvent,
  ChatMessage,
  ProtocolType,
  ActiveTab,
  JarvisActivityStatus,
} from './types/jarvis';
import { useJarvisTheme } from './theme/ThemeContext';
import { HeaderNav } from './components/HeaderNav';
import { JarvisAvatar } from './components/JarvisAvatar';
import { OsirisGlobalMap } from './components/OsirisGlobalMap';
import { AutoDirectivesPanel, SystemDirective } from './components/AutoDirectivesPanel';
import { CoworkTerminalWorkspace } from './components/CoworkTerminalWorkspace';
import { OsintReconToolkit } from './components/OsintReconToolkit';
import { DeviceMatrix } from './components/DeviceMatrix';
import { AgendaPanel } from './components/AgendaPanel';
import { ChatConsole } from './components/ChatConsole';
import { HoloBlueprintGenerator } from './components/HoloBlueprintGenerator';
import { ProtocolSelector, PROTOCOLS_LIST } from './components/ProtocolSelector';
import { AppearanceModal } from './components/AppearanceModal';
import { PCInstallationGuideModal } from './components/PCInstallationGuideModal';
import { sendJarvisMessage, requestJarvisTts } from './services/jarvisApi';
import { cleanTextForSpeech, base64ToAudioBlob, getBestBrowserVoice } from './utils/audioUtils';
import { soundEffects } from './services/soundEffects';
import {
  Mic,
  MicOff,
  Sparkles,
  Zap,
  Volume2,
  Calendar,
  Sliders,
  Shield,
  Layers,
  Activity,
  Radio,
  Globe,
  Terminal,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

const INITIAL_DEVICES: Device[] = [
  {
    id: 'living_lights',
    name: 'Iluminação Quântica',
    room: 'living',
    roomLabel: 'Salão Principal',
    type: 'light',
    status: true,
    value: 80,
    color: '#00e5ff',
  },
  {
    id: 'thermostat',
    name: 'Termostato Atmosférico',
    room: 'living',
    roomLabel: 'Salão Principal',
    type: 'thermostat',
    status: true,
    value: 22,
    meta: { humidity: 46 },
  },
  {
    id: 'lab_lights',
    name: 'Bancada Holográfica de Cowork',
    room: 'lab',
    roomLabel: 'Laboratório & Cowork',
    type: 'light',
    status: true,
    value: 100,
    color: '#00e5ff',
  },
  {
    id: 'robot_arm_dume',
    name: 'Braço Robótico DUM-E',
    room: 'lab',
    roomLabel: 'Laboratório & Cowork',
    type: 'robotics',
    status: false,
    meta: { mode: 'Standby' },
  },
  {
    id: 'security_lock',
    name: 'Escudo & Travas Perimetrais',
    room: 'security',
    roomLabel: 'Perímetro & Defesa',
    type: 'lock',
    status: true,
  },
  {
    id: 'patrol_drone',
    name: 'Drone Sentinel de Patrulha',
    room: 'security',
    roomLabel: 'Perímetro & Defesa',
    type: 'drone',
    status: false,
    meta: { battery: 94 },
  },
  {
    id: 'sound_system',
    name: 'Sistema de Som Imersivo',
    room: 'media',
    roomLabel: 'Mídia & Áudio',
    type: 'sound',
    status: true,
    value: 65,
    meta: { currentTrack: 'Ambient Synth - Cybernetic Focus' },
  },
];

const INITIAL_AGENDA: AgendaEvent[] = [
  {
    id: '1',
    title: 'Revisão Estratégica com a Diretoria Executiva',
    date: new Date().toISOString().split('T')[0],
    time: '11:00',
    category: 'meeting',
    priority: 'critical',
    notes: 'Alinhamento dos relatórios de inteligência geoespacial e infraestrutura.',
    completed: false,
  },
  {
    id: '2',
    title: 'Deploy e Teste de Carga do Terminal Cowork',
    date: new Date().toISOString().split('T')[0],
    time: '15:30',
    category: 'lab',
    priority: 'high',
    notes: 'Avaliação da latência dos scripts e verificação de integridade dos watchers.',
    completed: false,
  },
  {
    id: '3',
    title: 'Auditoria de Vulnerabilidades OSINT nos Servidores',
    date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    time: '10:00',
    category: 'work',
    priority: 'medium',
    notes: 'Varredura de portas abertas e sincronização de feeds de inteligência.',
    completed: false,
  },
];

const INITIAL_DIRECTIVES: SystemDirective[] = [
  {
    id: 'dir_usd_brl',
    title: 'Monitor de Câmbio USD/BRL em Tempo Real',
    targetType: 'currency',
    targetQuery: 'USD-BRL',
    intervalSeconds: 30,
    actionRule: 'display_ticker',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'dir_btc_crypto',
    title: 'Monitor de Criptoativos BTC/USD',
    targetType: 'crypto',
    targetQuery: 'BTC-USD',
    intervalSeconds: 30,
    actionRule: 'display_ticker',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

export default function App() {
  const { colors } = useJarvisTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('osiris');
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [agenda, setAgenda] = useState<AgendaEvent[]>(INITIAL_AGENDA);
  const [directives, setDirectives] = useState<SystemDirective[]>(INITIAL_DIRECTIVES);
  const [activeProtocol, setActiveProtocol] = useState<ProtocolType>('normal');
  const [isProtocolModalOpen, setIsProtocolModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState(false);

  // Live financial dollar badge data for HUD
  const [liveDollar, setLiveDollar] = useState<{ bid: string; pctChange: string } | null>(null);

  // Jarvis status & voice
  const [jarvisStatus, setJarvisStatus] = useState<JarvisActivityStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [jarvisVoice, setJarvisVoice] = useState<string>(() => {
    try {
      return localStorage.getItem('jarvis_voice') || 'Fenrir';
    } catch {
      return 'Fenrir';
    }
  });
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);

  const handleUpdateJarvisVoice = (voice: string) => {
    setJarvisVoice(voice);
    try {
      localStorage.setItem('jarvis_voice', voice);
    } catch {
      // Ignored
    }
  };

  // Chat message stream
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      role: 'assistant',
      content:
        'Às suas ordens, senhor. O sistema unificado JARVIS & Osiris.ai está operacional. O terminal de cowork, os módulos de diretrizes e o toolkit OSINT estão conectados. Como posso auxiliá-lo?',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // Refs for Web Speech, Audio, and concurrency tracking
  const recognitionRef = useRef<any>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const pulseIntervalRef = useRef<any>(null);
  const isLoadingChatRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);
  const activeRequestIdRef = useRef<number>(0);

  // Keep ref synchronized with state to prevent stale closures in event handlers
  useEffect(() => {
    isLoadingChatRef.current = isLoadingChat;
  }, [isLoadingChat]);

  // Fetch live market ticker periodically for HUD badge
  useEffect(() => {
    const fetchTicker = async () => {
      try {
        const res = await fetch('/api/market/ticker');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.usdBrl?.bid) {
            setLiveDollar({
              bid: data.usdBrl.bid,
              pctChange: data.usdBrl.pctChange,
            });
            return;
          }
        }
        setLiveDollar(null);
      } catch {
        setLiveDollar(null);
      }
    };

    fetchTicker();
    const interval = setInterval(fetchTicker, 30000);
    return () => clearInterval(interval);
  }, []);

  // Web Speech Recognition Setup (Initialized once to avoid race conditions and restarts)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
        setJarvisStatus('listening');
        soundEffects.playJarvisWake();
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            setTranscript(event.results[i][0].transcript);
          }
        }

        if (finalTranscript) {
          setTranscript(finalTranscript);
          if (!isLoadingChatRef.current) {
            handleVoiceCommand(finalTranscript);
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        isListeningRef.current = false;
        setJarvisStatus('idle');
      };

      recognition.onend = () => {
        setIsListening(false);
        isListeningRef.current = false;
        setJarvisStatus((curr) => (curr === 'listening' ? 'idle' : curr));
      };

      recognitionRef.current = recognition;

      return () => {
        try {
          recognition.abort();
        } catch {
          // Ignored
        }
      };
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Reconhecimento de fala não suportado neste navegador. Utilize o teclado ou Chrome/Edge.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      isListeningRef.current = false;
      setJarvisStatus('idle');
    } else {
      try {
        setTranscript('');
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Helper to clear audio playback and intervals
  const stopAllAudio = () => {
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Play assistant voice response with high-fidelity Gemini TTS and resilient browser fallback
  const playVoiceResponse = useCallback(
    async (text: string, messageId: string, existingAudio?: string) => {
      if (isMuted) return;

      stopAllAudio();
      setCurrentlySpeakingId(messageId);
      setJarvisStatus('speaking');

      const cleanText = cleanTextForSpeech(text);
      if (!cleanText) {
        setCurrentlySpeakingId(null);
        setJarvisStatus('idle');
        setAudioLevel(0);
        return;
      }

      // Helper for browser speech synthesis fallback
      const playBrowserFallback = () => {
        if (!('speechSynthesis' in window)) {
          setCurrentlySpeakingId(null);
          setJarvisStatus('idle');
          setAudioLevel(0);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.0;
        utterance.pitch = 0.88;

        const bestVoice = getBestBrowserVoice();
        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        pulseIntervalRef.current = setInterval(() => {
          setAudioLevel(0.25 + Math.random() * 0.65);
        }, 80);

        utterance.onend = () => {
          stopAllAudio();
          setCurrentlySpeakingId(null);
          setJarvisStatus('idle');
          setAudioLevel(0);
        };

        utterance.onerror = () => {
          stopAllAudio();
          setCurrentlySpeakingId(null);
          setJarvisStatus('idle');
          setAudioLevel(0);
        };

        window.speechSynthesis.speak(utterance);
      };

      // Helper to play base64 audio
      const playBase64 = (base64Data: string) => {
        try {
          const blob = base64ToAudioBlob(base64Data);
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          pulseIntervalRef.current = setInterval(() => {
            if (!audio.paused && !audio.ended) {
              setAudioLevel(0.35 + Math.random() * 0.55);
            }
          }, 70);

          audio.onended = () => {
            stopAllAudio();
            URL.revokeObjectURL(audioUrl);
            setCurrentlySpeakingId(null);
            setJarvisStatus('idle');
            setAudioLevel(0);
          };

          audio.onerror = () => {
            stopAllAudio();
            URL.revokeObjectURL(audioUrl);
            playBrowserFallback();
          };

          audio.play().catch(() => {
            stopAllAudio();
            URL.revokeObjectURL(audioUrl);
            playBrowserFallback();
          });
        } catch {
          playBrowserFallback();
        }
      };

      if (existingAudio) {
        playBase64(existingAudio);
        return;
      }

      try {
        const audioBase64 = await requestJarvisTts(cleanText.slice(0, 480), jarvisVoice);
        if (audioBase64) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, audioBase64 } : m))
          );
          playBase64(audioBase64);
        } else {
          playBrowserFallback();
        }
      } catch {
        playBrowserFallback();
      }
    },
    [isMuted, jarvisVoice]
  );

  // Device update handler
  const handleUpdateDevice = (id: string, updates: Partial<Device>) => {
    setDevices((prev) =>
      prev.map((dev) => (dev.id === id ? { ...dev, ...updates } : dev))
    );
  };

  // Execute protocol
  const handleSelectProtocol = (protocolId: ProtocolType) => {
    setActiveProtocol(protocolId);

    if (protocolId === 'lockdown') {
      setJarvisStatus('alert');
      setDevices((prev) =>
        prev.map((d) => {
          if (d.type === 'lock') return { ...d, status: true };
          if (d.type === 'drone') return { ...d, status: true };
          if (d.type === 'light') return { ...d, status: true, color: '#ef4444', value: 100 };
          return d;
        })
      );
    } else if (protocolId === 'party_mode') {
      setJarvisStatus('speaking');
      setDevices((prev) =>
        prev.map((d) => {
          if (d.type === 'light') return { ...d, status: true, color: '#ec4899', value: 90 };
          if (d.type === 'sound')
            return {
              ...d,
              status: true,
              value: 85,
            };
          return d;
        })
      );
      setTimeout(() => setJarvisStatus('idle'), 4000);
    } else if (protocolId === 'focus_lab') {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id === 'lab_lights') return { ...d, status: true, color: '#00e5ff', value: 100 };
          if (d.id === 'robot_arm_dume') return { ...d, status: true, meta: { mode: 'Solda & Calibração' } };
          return d;
        })
      );
    } else if (protocolId === 'night_owl') {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.type === 'lock') return { ...d, status: true };
          if (d.type === 'light') return { ...d, status: true, color: '#f59e0b', value: 15 };
          if (d.type === 'thermostat') return { ...d, value: 20 };
          if (d.type === 'sound') return { ...d, status: false };
          return d;
        })
      );
    } else if (protocolId === 'morning_briefing') {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.type === 'light') return { ...d, status: true, color: '#fef08a', value: 70 };
          if (d.type === 'thermostat') return { ...d, value: 23 };
          return d;
        })
      );
      generateDailyBriefing();
    } else {
      setJarvisStatus('idle');
    }
  };

  // Operation Verification Pipeline
  // Priorities 5 & 6: Separate tool request from execution. Validate params, execute service, verify result, then produce confirmation.
  // Priority 9: Disclose reality if no persistent database and no background daemon executor.
  const executeAndVerifyTools = async (
    functionCalls: Array<{ name: string; args: any }>,
    currentDevices: Device[],
    currentAgenda: AgendaEvent[]
  ): Promise<Array<{ toolName: string; success: boolean; message: string }>> => {
    const results: Array<{ toolName: string; success: boolean; message: string }> = [];

    for (const call of functionCalls) {
      if (call.name === 'control_device') {
        const { deviceId, action, value } = call.args || {};
        const dev = currentDevices.find((d) => d.id === deviceId);

        if (!dev) {
          results.push({
            toolName: 'control_device',
            success: false,
            message: `Dispositivo "${deviceId || 'desconhecido'}" não foi encontrado no sistema.`,
          });
          continue;
        }

        const validActions = [
          'turn_on',
          'turn_off',
          'toggle',
          'set_brightness',
          'set_color',
          'set_temperature',
          'set_volume',
          'activate_patrol',
          'return_to_dock',
        ];

        if (!validActions.includes(action)) {
          results.push({
            toolName: 'control_device',
            success: false,
            message: `Ação "${action}" não é suportada pelo dispositivo "${dev.name}".`,
          });
          continue;
        }

        // Apply validated state change
        setDevices((prev) =>
          prev.map((d) => {
            if (d.id === deviceId) {
              if (action === 'turn_on') return { ...d, status: true };
              if (action === 'turn_off') return { ...d, status: false };
              if (action === 'toggle') return { ...d, status: !d.status };
              if (action === 'set_brightness' && value !== undefined)
                return { ...d, value: Number(value), status: Number(value) > 0 };
              if (action === 'set_temperature' && value !== undefined)
                return { ...d, value: Number(value) };
              if (action === 'set_color' && value) return { ...d, color: value, status: true };
              if (action === 'set_volume' && value !== undefined)
                return { ...d, value: Number(value), status: Number(value) > 0 };
              if (action === 'activate_patrol') return { ...d, status: true };
              if (action === 'return_to_dock') return { ...d, status: false };
            }
            return d;
          })
        );
        soundEffects.playConfirm();
        results.push({
          toolName: 'control_device',
          success: true,
          message: `Dispositivo "${dev.name}" (${dev.roomLabel}): ação "${action}" executada com sucesso.`,
        });
      } else if (call.name === 'manage_agenda') {
        const { action, title, date, time, category, priority, notes, eventId } = call.args || {};

        if (action === 'create') {
          if (!title || typeof title !== 'string' || !title.trim()) {
            results.push({
              toolName: 'manage_agenda',
              success: false,
              message: 'Falha: título do compromisso não foi informado.',
            });
            continue;
          }

          const newEvt: AgendaEvent = {
            id: String(Date.now()),
            title: title.trim(),
            date: date || new Date().toISOString().split('T')[0],
            time: time || '14:00',
            category: category || 'work',
            priority: priority || 'medium',
            notes,
            completed: false,
          };
          setAgenda((prev) => [...prev, newEvt]);
          soundEffects.playConfirm();
          results.push({
            toolName: 'manage_agenda',
            success: true,
            message: `Compromisso "${newEvt.title}" registrado na agenda para ${newEvt.date} às ${newEvt.time}.`,
          });
        } else if (action === 'delete') {
          const existing = currentAgenda.find((a) => a.id === eventId);
          if (!existing) {
            results.push({
              toolName: 'manage_agenda',
              success: false,
              message: `Falha: compromisso ID "${eventId}" não localizado na agenda.`,
            });
            continue;
          }
          setAgenda((prev) => prev.filter((a) => a.id !== eventId));
          results.push({
            toolName: 'manage_agenda',
            success: true,
            message: `Compromisso "${existing.title}" removido da agenda.`,
          });
        } else {
          results.push({
            toolName: 'manage_agenda',
            success: false,
            message: `Ação de agenda "${action}" não é suportada.`,
          });
        }
      } else if (call.name === 'execute_protocol') {
        const { protocolName } = call.args || {};
        const validProtocols = ['lockdown', 'party_mode', 'focus_lab', 'night_owl', 'morning_briefing', 'normal'];

        if (!validProtocols.includes(protocolName)) {
          results.push({
            toolName: 'execute_protocol',
            success: false,
            message: `Protocolo "${protocolName}" não reconhecido pelos subsistemas de controle.`,
          });
          continue;
        }

        handleSelectProtocol(protocolName as ProtocolType);
        results.push({
          toolName: 'execute_protocol',
          success: true,
          message: `Protocolo "${protocolName}" validado e ativado.`,
        });
      } else if (call.name === 'run_terminal_command') {
        const { command } = call.args || {};
        if (!command || typeof command !== 'string') {
          results.push({
            toolName: 'run_terminal_command',
            success: false,
            message: 'Nenhum comando fornecido para o terminal.',
          });
          continue;
        }

        setActiveTab('cowork');
        try {
          const res = await fetch('/api/terminal/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: command.trim() }),
          });
          const termData = await res.json();
          if (res.ok && termData.exitCode === 0) {
            results.push({
              toolName: 'run_terminal_command',
              success: true,
              message: `Comando "${command}" executado com êxito (código de saída 0).`,
            });
          } else {
            results.push({
              toolName: 'run_terminal_command',
              success: false,
              message: `Comando "${command}" encerrou com erro (código ${termData.exitCode ?? res.status}): ${termData.stderr || termData.error || 'Erro na execução'}`,
            });
          }
        } catch (err: any) {
          results.push({
            toolName: 'run_terminal_command',
            success: false,
            message: `Falha de rede ao executar comando: ${err.message}`,
          });
        }
      } else if (call.name === 'query_osint_intel') {
        const { queryType, target } = call.args || {};
        setActiveTab('osint');
        try {
          const res = await fetch('/api/osint/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queryType, target }),
          });
          const osintData = await res.json();
          if (res.ok && osintData.success) {
            results.push({
              toolName: 'query_osint_intel',
              success: true,
              message: `Consulta OSINT (${queryType}) concluída para "${target}".`,
            });
          } else {
            results.push({
              toolName: 'query_osint_intel',
              success: false,
              message: `Consulta OSINT falhou: ${osintData.error || 'Erro na varredura'}`,
            });
          }
        } catch (err: any) {
          results.push({
            toolName: 'query_osint_intel',
            success: false,
            message: `Erro na consulta OSINT: ${err.message}`,
          });
        }
      } else if (call.name === 'create_system_directive') {
        const { directiveTitle, targetType, targetQuery, intervalSeconds, actionRule } = call.args || {};
        if (!directiveTitle || !targetQuery) {
          results.push({
            toolName: 'create_system_directive',
            success: false,
            message: 'Parâmetros obrigatórios ausentes para criação de diretriz.',
          });
          continue;
        }

        const newDir: SystemDirective = {
          id: 'dir_' + Date.now(),
          title: directiveTitle,
          targetType: targetType || 'currency',
          targetQuery: targetQuery,
          intervalSeconds: intervalSeconds || 30,
          actionRule: actionRule || 'display_ticker',
          isActive: true,
          createdAt: new Date().toISOString(),
        };

        setDirectives((prev) => [newDir, ...prev.filter((d) => d.targetQuery !== newDir.targetQuery)]);
        soundEffects.playConfirm();
        setActiveTab('directives');

        // Priority 9 compliance: Do not claim persistent storage or autonomous daemon if not present
        results.push({
          toolName: 'create_system_directive',
          success: true,
          message: `Diretriz "${directiveTitle}" adicionada à interface desta sessão. Nota: Armazenamento persistente e executor em segundo plano não estão configurados neste ambiente; o monitoramento requer a interface ativa.`,
        });
      } else {
        results.push({
          toolName: call.name,
          success: false,
          message: `Ferramenta "${call.name}" não reconhecida.`,
        });
      }
    }

    return results;
  };

  // Main chat message dispatcher
  const handleSendMessage = async (
    text: string,
    options: { useSearch: boolean; deepReasoning: boolean; image: string | null }
  ) => {
    if (!text.trim() && !options.image) return;
    if (isLoadingChat) return;

    // Concurrency tracking: sequence counter guarantees only latest request updates state
    const currentRequestId = ++activeRequestIdRef.current;

    const userMsgId = String(Date.now());
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoadingChat(true);
    setJarvisStatus('processing');

    try {
      const response = await sendJarvisMessage({
        message: text,
        history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        devices,
        agenda,
        activeProtocol,
        useSearch: options.useSearch,
        deepReasoning: options.deepReasoning,
        image: options.image,
      });

      // If a newer message was dispatched while this was in flight, discard to prevent out-of-order race conditions
      if (currentRequestId !== activeRequestIdRef.current) {
        return;
      }

      // Execute and verify tool calls
      let executionConfirmations: string[] = [];
      if (response.functionCalls && response.functionCalls.length > 0) {
        const verifiedReports = await executeAndVerifyTools(response.functionCalls, devices, agenda);
        executionConfirmations = verifiedReports.map((r) =>
          r.success ? `✓ ${r.message}` : `✕ ${r.message}`
        );
      }

      // Construct final verified response
      let finalContent = response.reply;
      if (executionConfirmations.length > 0) {
        const summary = executionConfirmations.join('\n');
        finalContent = response.reply
          ? `${response.reply}\n\n[Confirmação de Operações]:\n${summary}`
          : `[Confirmação de Operações]:\n${summary}`;
      } else if (!finalContent) {
        finalContent = 'Solicitação processada pelos subsistemas.';
      }

      const assistantMsgId = String(Date.now() + 1);
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: finalContent,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        toolsCalled: response.functionCalls,
        searchSources: response.searchGrounding?.sources,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Synthesize voice only for verified final content
      if (!isMuted && finalContent) {
        playVoiceResponse(finalContent, assistantMsgId);
      } else {
        setJarvisStatus('idle');
      }
    } catch (error: any) {
      console.error('Erro no processamento do Jarvis:', error);
      if (currentRequestId === activeRequestIdRef.current) {
        const errorMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: 'Falha no processamento da solicitação. Nenhuma alteração foi realizada nos subsistemas.',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
        soundEffects.playAlert();
        setJarvisStatus('idle');
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setIsLoadingChat(false);
      }
    }
  };

  const handleVoiceCommand = (spokenText: string) => {
    if (!spokenText.trim() || isLoadingChatRef.current) return;
    handleSendMessage(spokenText, {
      useSearch: false,
      deepReasoning: false,
      image: null,
    });
  };

  // Executive Daily Briefing
  const generateDailyBriefing = () => {
    const todayAppointments = agenda.filter((a) => !a.completed);
    let prompt = `Jarvis, execute o meu briefing matinal executivo. Informe sobre a cotação do dólar, o status do globo Osiris e as ${todayAppointments.length} tarefas da minha agenda.`;
    handleSendMessage(prompt, {
      useSearch: true,
      deepReasoning: false,
      image: null,
    });
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEffects.isMuted = next;
    if (next) {
      if (currentAudioRef.current) currentAudioRef.current.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setCurrentlySpeakingId(null);
      if (jarvisStatus === 'speaking') setJarvisStatus('idle');
    } else {
      soundEffects.playConfirm();
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col relative overflow-x-hidden selection:bg-cyan-500 selection:text-black">
      {/* Background Cyber Grid */}
      <div className="fixed inset-0 cyber-grid pointer-events-none opacity-20 z-0" />

      {/* Protocol Alert banner if Lockdown is active */}
      {activeProtocol === 'lockdown' && (
        <div className="sticky top-0 z-50 bg-red-600/90 text-white font-mono font-bold text-xs py-1.5 px-4 text-center tracking-widest flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(239,68,68,0.8)] animate-pulse">
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
          <span>ALERTA DE SEGURANÇA MÁXIMA: PERÍMETRO BLINDADO</span>
          <button
            onClick={() => handleSelectProtocol('normal')}
            className="px-2.5 py-0.5 rounded bg-black/40 hover:bg-black/60 border border-white/40 text-xs font-mono cursor-pointer"
          >
            Encerrar Alerta
          </button>
        </div>
      )}

      {/* Top Navigation & Status */}
      <HeaderNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isListening={isListening}
        onToggleListening={toggleListening}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        activeProtocol={activeProtocol}
        onOpenProtocolModal={() => setIsProtocolModalOpen(true)}
        onOpenInstallModal={() => setIsInstallModalOpen(true)}
        onOpenAppearanceModal={() => setIsAppearanceModalOpen(true)}
        status={jarvisStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 relative z-10">
        {/* TAB 1: OSIRIS.AI GLOBAL GEOSPATIAL PLATFORM */}
        {activeTab === 'osiris' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Split: Full Interactive Map + Floating Cowork Console */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 8 Cols: Full Osiris Map */}
              <div className="lg:col-span-8 h-[640px] rounded-2xl overflow-hidden border border-cyan-500/40 shadow-2xl relative bg-slate-950">
                <OsirisGlobalMap className="w-full h-full" />
              </div>

              {/* Right 4 Cols: Jarvis Avatar & Neural Console */}
              <div className="lg:col-span-4 space-y-4">
                {/* Holographic Avatar Card with Eye Tracking */}
                <div className="p-4 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 flex flex-col items-center justify-center relative overflow-hidden shadow-xl">
                  <div className="absolute top-2 left-3 font-mono text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    INTERFACE FACIAL // RASTREAMENTO OCULAR
                  </div>

                  <JarvisAvatar
                    status={jarvisStatus}
                    audioLevel={audioLevel}
                    onClick={toggleListening}
                    size="md"
                  />

                  {/* Speech Trigger Button */}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={toggleListening}
                      className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                        isListening
                          ? 'bg-rose-600 text-white animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.5)]'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                      }`}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" />
                          <span>Parar Escuta</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span>Falar com o Jarvis</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={generateDailyBriefing}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors"
                      title="Briefing Matinal em Áudio"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quick Chat Console */}
                <div className="h-[400px]">
                  <ChatConsole
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    isLoading={isLoadingChat}
                    isListening={isListening}
                    onToggleListening={toggleListening}
                    onPlayVoice={playVoiceResponse}
                    currentlySpeakingId={currentlySpeakingId}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TERMINAL COWORK & CLAUDE CODE / DEVIN WORKSPACE */}
        {activeTab === 'cowork' && (
          <div className="animate-in fade-in duration-300">
            <CoworkTerminalWorkspace />
          </div>
        )}

        {/* TAB 3: AUTO-DIRECTIVES ENGINE & VOICE UPDATES */}
        {activeTab === 'directives' && (
          <div className="animate-in fade-in duration-300">
            <AutoDirectivesPanel
              directives={directives}
              onAddDirective={(dir) => {
                const item: SystemDirective = {
                  ...dir,
                  id: 'dir_' + Date.now(),
                  createdAt: new Date().toISOString(),
                };
                setDirectives((prev) => [item, ...prev]);
                soundEffects.playConfirm();
              }}
              onToggleDirective={(id) => {
                setDirectives((prev) =>
                  prev.map((d) => (d.id === id ? { ...d, isActive: !d.isActive } : d))
                );
              }}
              onDeleteDirective={(id) => {
                setDirectives((prev) => prev.filter((d) => d.id !== id));
              }}
              onTriggerVoiceDirective={(text) => handleVoiceCommand(text)}
            />
          </div>
        )}

        {/* TAB 4: OSINT RECON TOOLKIT */}
        {activeTab === 'osint' && (
          <div className="animate-in fade-in duration-300">
            <OsintReconToolkit />
          </div>
        )}

        {/* TAB 5: SMART HOME DEVICES MATRIX */}
        {activeTab === 'devices' && (
          <div className="animate-in fade-in duration-300">
            <DeviceMatrix
              devices={devices}
              onUpdateDevice={handleUpdateDevice}
              onExecuteVoiceCommand={handleVoiceCommand}
            />
          </div>
        )}

        {/* TAB 6: EXECUTIVE AGENDA */}
        {activeTab === 'agenda' && (
          <div className="animate-in fade-in duration-300">
            <AgendaPanel
              agenda={agenda}
              onAddEvent={(newEvent) => {
                const item: AgendaEvent = {
                  ...newEvent,
                  id: String(Date.now()),
                  completed: false,
                };
                setAgenda((prev) => [...prev, item]);
              }}
              onToggleComplete={(id) => {
                setAgenda((prev) =>
                  prev.map((a) => (a.id === id ? { ...a, completed: !a.completed } : a))
                );
              }}
              onDeleteEvent={(id) => {
                setAgenda((prev) => prev.filter((a) => a.id !== id));
              }}
              onRequestBriefing={generateDailyBriefing}
              onExecuteVoiceCommand={handleVoiceCommand}
            />
          </div>
        )}

        {/* TAB 7: HOLOGRAPHIC BLUEPRINTS & CAD */}
        {activeTab === 'blueprints' && (
          <div className="animate-in fade-in duration-300">
            <HoloBlueprintGenerator />
          </div>
        )}
      </main>

      {/* Floating Realtime Dollar Badge (HUD Ribbon) */}
      <div
        onClick={() => setActiveTab('directives')}
        className="fixed bottom-4 right-4 z-40 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-cyan-500/40 shadow-2xl flex items-center gap-3 cursor-pointer hover:border-cyan-400 transition-all font-mono text-xs group"
        title="Clique para abrir painel de Diretrizes e Watchers"
      >
        <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
          <DollarSign className="w-3.5 h-3.5" />
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-semibold">USD/BRL DIRETO</div>
          <div className="text-cyan-300 font-bold flex items-center gap-1.5">
            {liveDollar ? (
              <>
                <span>R$ {liveDollar.bid}</span>
                <span className="text-emerald-400 text-[10px]">({liveDollar.pctChange}%)</span>
              </>
            ) : (
              <span className="text-slate-400 text-[10px]">Aguardando telemetria...</span>
            )}
          </div>
        </div>
        <span className={`w-2 h-2 rounded-full ${liveDollar ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'} ml-1`} />
      </div>

      {/* Protocol Selector Modal */}
      <ProtocolSelector
        isOpen={isProtocolModalOpen}
        onClose={() => setIsProtocolModalOpen(false)}
        activeProtocol={activeProtocol}
        onSelectProtocol={handleSelectProtocol}
      />

      {/* PC / Desktop Native Installation Guide Modal */}
      <PCInstallationGuideModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* Visual Customization & Appearance Modal */}
      <AppearanceModal
        isOpen={isAppearanceModalOpen}
        onClose={() => setIsAppearanceModalOpen(false)}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-cyan-500/15 bg-slate-950/80 py-3 px-6 text-center text-xs font-mono text-slate-500 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>JARVIS & OSIRIS.AI • PLATAFORMA DE COWORK E INTELIGÊNCIA GEOESPACIAL</span>
          <span className="text-cyan-400/70">NÚCLEO NEURAL AUTÔNOMO V4.2</span>
        </div>
      </footer>
    </div>
  );
}
