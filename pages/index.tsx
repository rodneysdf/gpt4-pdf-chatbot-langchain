import Layout from '@/components/layout';
import LoadingDots from '@/components/ui/LoadingDots';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAuth } from '@/providers/auth';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import {
  cache,
  getCollection,
  postPurgeDocuments,
  postSendUrl,
  postUploadFiles,
} from '@/utils/api';
import { signinError, signinErrorText, toFriendlyChatError } from '@/utils/errors';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import axios from 'axios';
import classNames from 'classnames';
import { useGranularEffect } from "granular-hooks";
import { Document } from 'langchain/document';
import { Fragment, useEffect, useRef, useState } from 'react';
import { BsExclamationTriangleFill, BsPersonCircle } from 'react-icons/bs';
import ReactMarkdown from 'react-markdown';
import { AWS_CHAT_URL } from '../config/aws-amplify';


const DocumentUpload = (props: any) => {
  const { onSetCollectionSize, openAiKey, anthropicKey } = props;
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const onFilesChange = async (e: any) => {
    const files = Array.from(e.target.files) as File[];
    setLoading(true);

    try {
      const response = await postUploadFiles(files, openAiKey, anthropicKey, auth);
      e.target.value = null;
      if (response) {
        if (response.data?.size) {
          onSetCollectionSize(response.data.size);
          cache.set('vectorCount', response.data.size)
        }
      }
    } catch (err: any) {
      if (axios.isAxiosError(err)) {
        console.log('A?', err?.response)
        alert(`Failed upload '${err?.response?.data?.error}'`);
      } else if (err === 'No current user') {
        signinError()
      } else {
        console.log('err', err);
        alert(`Error encountered when uploading the file: ${err?.response?.statusText}`);
      }
    }
    setLoading(false);
  };

  return (
    <div>
      <button
        onClick={() => openFileDialog()}
        className="border px-2 py-1 rounded-md w-full shadow-slate-300 shadow hover:bg-slate-500/10"
      >
        {loading ? <LoadingDots color="#000" /> : 'Upload documents'}
      </button>
      <input
        multiple
        // accept="application/pdf,application/vnd.ms-excel,application/JSON,text/csv,text/text"
        onChange={onFilesChange}
        ref={fileInputRef}
        type="file"
        className="hidden"
      />
      <div className="text-sm font-normal text-center w-full">
        pdf,docx,txt,json,csv,xls,xlsx,vtt
        <br />
        (each upload set limited
        <br />
        to 6mb total size)
      </div>
    </div>
  );
};

const AddUrl = (props: any) => {
  const { onSetCollectionSize, openAiKey, anthropicKey } = props;
  const auth = useAuth();

  const [loading, setLoading] = useState(false);

  const promptForUrl = () => {
    const url = prompt('Enter a Google Doc, Sheet, Drive folder link, or add a file via url', 'https://example.com');

    if (url === null) {
      return;
    }

    if (url.trim().length === 0) {
      alert('URL cannot be empty.');
      return;
    }

    sendUrl(url, auth);
  };

  const sendUrl = async (url: string, auth: any) => {
    setLoading(true);

    try {
      const response = await postSendUrl(url, openAiKey, anthropicKey, auth);
      if (response) {
        if (response.data?.size) {
          onSetCollectionSize(response.data.size);
          cache.set('vectorCount', response.data.size)
        }
      }

    } catch (err: any) {
      if (axios.isAxiosError(err)) {
        if (err?.response?.status == 401) {
          alert(`Permission to the link was denied. Please share the document\nwith 'p2-spec-access@devfactory.com' and then re-add.`);
        } else if (err?.response?.status == 404) {
          const msg: string = (err?.response?.data?.error as string)
          if (msg.startsWith('No files found in drive')) {
            alert(`${err?.response?.data?.error}. Please check that the folder is shared with 'p2-spec-access@devfactory.com'.`);
          } else {
            alert(`${err?.response?.data?.error}. Please check the url / link you are adding.`);
          }
        } else {
          console.log('A?', err?.response)
          alert(`Error when adding the url: ${err?.response?.data?.error}`);
        }
      } else if (err === 'No current user') {
        signinError()
      } else {
        console.log('err', err);
        alert(`Error encountered when adding the url: ${err}`);
      }
    }
    setLoading(false);
  };


  return (
    <div>
      <button onClick={promptForUrl} className="border px-2 py-1 rounded-md w-full shadow-slate-300 shadow hover:bg-slate-500/10">
        {loading ? <LoadingDots color="#000" /> : 'Add by url'}
      </button>
      <div className="text-sm font-normal text-center w-full">
        Google Drive folder or Doc
      </div>
      <div className="text-sm font-normal text-center w-full"
      >link, or a file url
      </div>
    </div>
  );
};

const PurgeDocuments = (props: any) => {
  const { onSetCollectionSize, onClearMessageState } = props
  const [loading, setLoading] = useState(false);
  const auth = useAuth();

  const purgeDocuments = async () => {
    setLoading(true);

    try {
      const response = await postPurgeDocuments(auth);
      if (response) {
        if (response.data?.size || response.data?.size === 0) {
          onSetCollectionSize(response.data.size);
          cache.set('vectorCount', response.data.size)
        }
      }
    } catch (err: any) {
      if (err === 'No current user') {
        signinError()
      } else {
        alert('an error occured purging the documents');
        console.log('err', err.response);
      }
    }
    onClearMessageState();
    setLoading(false);
  };

  return (
    <div>
      <button
        onClick={purgeDocuments}
        className="border px-2 py-1 rounded-md w-40 shadow-slate-300 shadow hover:bg-slate-500/10"
      >
        {loading ? <LoadingDots color="#000" /> : 'Purge'}
      </button>

    </div>
  );
};

const Profile = (props: any) => {
  const { apiKey, onSetApiKey, anthropicKey, onSetAnthropicKey, onNavigate } = props;
  const auth = useAuth();

  const handleSetApiKey = (apiKey: string) => {
    window.localStorage.setItem('openai-api-key', apiKey);
    onSetApiKey(apiKey);
  };
  const handleSetAnthropicKey = (anthropicKey: string) => {
    window.localStorage.setItem('anthropic-api-key', anthropicKey);
    onSetAnthropicKey(anthropicKey);
  };
  return (
    <div className="flex flex-col  w-2/3 self-center rounded-2xl bg-gray-100 p-4">
      <div className="flex flex-row gap-3 text-xl font-bold mb-4">
        <BsPersonCircle className="text-2xl" /> Profile
      </div>
      <p className="text-xl">Email: {auth.user?.attributes.email}</p>
      <br />
      <br />
      Use my own:
      <div className="grid grid-cols-5 grid-rows-2">
        <div className="col-span-2 px-2 py-1 whitespace-nowrap">
          <span><a
            href="https://openai.com/"
            className="hover:text-slate-600 cursor-pointer px-0 py-0">OpenAI API</a> key:</span>
        </div>
        <input
          className="border rounded-md w-full pl-1 col-span-3 px-2 py-1"
          type="text"
          onChange={(e) => handleSetApiKey(e.target.value)}
          value={apiKey}
        />

        <div className="col-span-2 px-2 py-1 whitespace-nowrap">
          <span><a
            href="https://www.anthropic.com/"
            className="hover:text-slate-600 cursor-pointer px-0 py-0">Anthropic {"'Claude'"} API </a>key:</span>
        </div >
        <input
          className="border rounded-md w-full pl-1 col-span-3"
          type="text"
          onChange={(e) => handleSetAnthropicKey(e.target.value)}
          value={anthropicKey}
        />
      </div>
      <br />

      <div className="flex flex-row-reverse gap-3 mt-4">
        <button
          onClick={() => onNavigate('home')}
          className="border px-2 py-1 rounded-md w-40 shadow-slate-400 shadow bg-slate-300/10 hover:bg-slate-700/10"
        >
          OK
        </button>
        <button
          onClick={() => {
            // signout will not delete users local keys
            onSetApiKey('');
            onSetAnthropicKey('');
            auth.signOut();
          }}
          className="border px-2 py-1 rounded-md w-40 shadow-slate-300 shadow hover:bg-slate-500/10"
        >
          Sign out
        </button>
      </div>
    </div >
  );
};

export default function Home() {
  const auth = useAuth();
  const [model, setModel] = useState<string>('gpt-3.5-turbo-0301');
  const [algo, setAlgo] = useState<string>(
    'ConversationalRetrievalQAChain-lc',
  );
  const [documentCount, setDocumentCount] = useState<number>(22);
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<{
    messages: Message[];
    pending?: string;
    history: [string, string][];
  }>({
    messages: [
      {
        message: 'Hi, what would you like to know about these documents?',
        type: 'apiMessage',
      },
    ],
    history: [],
    pending: '',
  });

  const { messages, history, pending } = messageState;

  const clearMessageState = () => {
    setMessageState({
      messages: [
        {
          message: 'Hi, what would you like to know about these documents?',
          type: 'apiMessage',
        },
      ],
      history: [],
      pending: '',
    });
  }

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageListRef.current?.scrollTo(0, messageListRef.current.scrollHeight);
    textAreaRef?.current?.focus()
  }, [messages]);


  // // no longer needed with streaming
  // const postChat = makePostChat(
  //   {
  //     onSuccess(data, question) {
  //       console.log('PC Success response:', data)

  //       setMessageState((state) => ({
  //         ...state,
  //         messages: [
  //           ...state.messages,
  //           {
  //             type: 'apiMessage',
  //             message: data.text,
  //             sourceDocs: data.sourceDocuments,
  //           },
  //         ],
  //         history: [...state.history, [question, data.text]],
  //       }));

  //       setLoading(false);
  //     },
  //     onError(response) {
  //       setLoading(false);
  //       if (response === 'No current user') {
  //         setError(signinErrorText())
  //       } else if (axios.isAxiosError(response)) {
  //         console.log('A?', response?.response)
  //         // alert(`Error '${response?.response?.data?.error}`);
  //         // check for no license
  //         if (response?.request.status == 404) {
  //           setError(toFriendlyChatError(response?.response?.data.error))
  //           setModel('gpt-3.5-turbo-0301')
  //         } else {
  //           console.log('PC ErrA response:', response)
  //           setError(`An error occurred. Please try again - ${response}`);
  //         }
  //       } else {
  //         console.log('PC Err response:', response)
  //         // else show generic message
  //         setError(`An error occurred. Please try again - ${response}`);
  //       }
  //     },
  //   },
  //   auth
  // );


  //handle form submission
  async function handleSubmit(e: any) {
    e.preventDefault();

    setError(null);

   // OpenAI recommends replacing newlines with spaces for best results
    const sanitizedQuery = query.trim().replaceAll('\n', ' ')
    if (!sanitizedQuery && sanitizedQuery.length === 0) {
      // alert('Please input a question');
      setError('Please input a question')
      return;
    }
    let bearerToken: string = ''
    if (auth) {
      try {
        const accessToken = await auth.getAccessToken();
        if (accessToken) {
          bearerToken = "Bearer " + accessToken;
        } else {
          console.log("no accessToken!")
        }
      } catch (e) {
        // console.log("no auth header!")
      }
    }
    if (bearerToken.length === 0) {
      // console.log("no auth user!")
      setError(signinErrorText())
      return
    }

    const question = sanitizedQuery
    setMessageState((state) => {
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            type: 'userMessage',
            message: question,
          },
        ],
        pending: '',
      }
    })
    let AnswerEntry: Message = {
      type: 'apiMessage',
      message: ''
    }

    setLoading(true);
    setQuery('');

    // Send the question to the server
    const ctrl = new AbortController();
    try {
      let answerStarted: boolean = false
      fetchEventSource(AWS_CHAT_URL + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': bearerToken,
          'Retry-After': '5',
        },
        body: JSON.stringify({
          question,
          history,
          model,
          documentCount,
          algo,
          openAiKey: openAiApiKey,
          anthropicKey: anthropicClaudeKey,
        }),
        signal: ctrl.signal,
        onmessage: (event: { data: string; }) => {
          if (event.data === '[START]') {
            // console.log('onmessage [START]:', event.data)
          } else if (event.data === '[DONE]' || event.data === '[ERROR]') {
            // console.log('onmessage [DONE/ERROR]:', event.data)
            // save question in history
            setMessageState((state) => ({
              history: [...state.history, [question, AnswerEntry.message ?? '']],
              messages: [
                ...state.messages,
              ]
            }));
            setLoading(false);
            ctrl.abort();
          } else if (event.data.startsWith('[ERROR]')) {
            console.log('onmessage [ERROR]:', event.data)
            if (event.data.length > '[ERROR] '.length) {
              // error from LangChain
              setError(event.data.slice('[ERROR] '.length))
            }
            setLoading(false);
            ctrl.abort();

          } else if (event.data === '[LLMEnd]') {
            // nothing
          } else {   // Data
            // console.log('onMessage other:', event)
            if (event.data.length > 0 && event.data.startsWith(`{`)) {
              const data = JSON.parse(event.data);
              // console.log('onMessage parsed:', data)

              if (data.token) {
                AnswerEntry.message = AnswerEntry.message + data.token
              }
              if (data.sourceDocs) {
                AnswerEntry.sourceDocs = (data.sourceDocs ?? []).slice(0, 15)
              }
              if (!answerStarted) {
                answerStarted = true
                setMessageState((state) => ({
                  history: [...state.history],
                  messages: [
                    ...state.messages,
                    AnswerEntry,
                  ],
                }))
              } else {
                setMessageState((state) => {
                  return {
                    history: [...state.history],
                    messages: [
                      ...state.messages
                    ]
                  }
                })
              }
            } else {
              console.log('unexpected message', event)
            }
          }
        },
        async onopen(response) {
          // console.log('onopen: status=', response.status, 'responseOK=', response.ok, 'responsedata=', response?.data,'type=', response.headers.get('content-type'))
          if (response.status >= 400) {
            try {
              console.log('error:', response.status, 'reason:', response.headers.get('x-error-reason'))
              const errHeader = response.headers.get('x-error-reason') ?? ''
              if (errHeader.length > 0) {
                const reason = JSON.parse(errHeader)
                if (reason.error === 'No current user') {
                  setError(signinErrorText())
                } else if (response.status == 404) {
                  setError(toFriendlyChatError(reason.error))
                  setModel('gpt-3.5-turbo-0301')
                } else if (response.status == 401) {
                  setError(signinErrorText())
                } else {
                  setError(`An error occurred. Please try again - ${reason.error}`);
                }
              }
              setLoading(false);
              ctrl.abort();
            } catch (err) {
              console.log('error catch', err)
            }
          }
        },
        onclose() {
          // console.log('onclose closing unexpected')
          ctrl.abort();
        },
        onerror(err) {
          console.log('onerror', err)
          ctrl.abort();
        }

      });
    } catch (error) {
      console.log(error);
      setLoading(false);
      setError('An error occurred while fetching the data. Please try again.');
      ctrl.abort();
    }
  }

  //prevent empty submissions
  const handleEnter = (e: any) => {
    if (e.key === 'Enter' && query) {
      handleSubmit(e);
    } else if (e.key == 'Enter') {
      e.preventDefault();
    }
  };

  const [page, setPage] = useState<string>('home');

  const handleNavigate = (path: string) => {
    setPage(path);
  };

  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [anthropicClaudeKey, setAnthropicClaudeKey] = useState('');

  useEffect(() => {
    const storedApiKey = window.localStorage.getItem('openai-api-key') || '';
    setOpenAiApiKey(storedApiKey);

    const storedAnthropicApiKey = window.localStorage.getItem('anthropic-api-key') || '';
    setAnthropicClaudeKey(storedAnthropicApiKey);

  }, [setOpenAiApiKey, setAnthropicClaudeKey]);

  // todo this end up calling getCollection 5 times during startup
  useGranularEffect(() => {
    const getUserProfile = async () => {
      if (auth?.isSignedIn) {
        try {
          const response = await getCollection(auth);
          if (response) {
            if (response.data?.size) {
              setCollectionSize(response.data.size);
            }
          }
        } catch (
        err: any // TODO: handle error
        ) {
          console.log('err', err.response);
        }
      }
    };
    getUserProfile();
  }, [auth.isSignedIn], [auth]);

  const [collectionSize, setCollectionSize] = useState<number | null>(0);

  const textAreaClass = classNames({
    [styles.textarea]: true,
    [styles.textareanormal]: error === null,
    [styles.textareaerror]: error !== null,
  });

  return (
    <>
      <Layout onNavigate={handleNavigate} apiKey={openAiApiKey}>
        {page === 'home' ? (
          <div className="mx-auto flex flex-col">
            <div className="flex flex-col bg-slate-400/10 p-1 rounded-md border">
              <div className="text-lg font-bold mt-0 m-2">
                Collection
                {collectionSize ? (
                  <span className="text-sm font-normal ml-2">
                    Size: ({collectionSize} chunks)
                  </span>
                ) : (
                  <span className="text-sm font-normal ml-3">
                    (Files are stored as embeddings only for this chat app)
                  </span>
                )}
              </div>
              <div className="flex flex-row gap-5 ml-2 mb-2">
                <AddUrl onSetCollectionSize={setCollectionSize} openAiKey={openAiApiKey} anthropicKey={anthropicClaudeKey} />
                <DocumentUpload onSetCollectionSize={setCollectionSize} openAiKey={openAiApiKey} anthropicKey={anthropicClaudeKey} />
                <PurgeDocuments onSetCollectionSize={setCollectionSize} onClearMessageState={clearMessageState} />
              </div>
            </div>

            <main className={styles.main}>
              <div className={styles.cloud}>
                <div ref={messageListRef} className={styles.messagelist}>
                  {messages.map((message, index) => {
                    let icon;
                    let className;
                    if (message.type === 'apiMessage') {
                      icon = (
                        <img
                          key={index}
                          src="/bot-image.png"
                          alt="AI"
                          width="40"
                          height="40"
                          className={styles.boticon}
                        />
                      );
                      className = styles.apimessage;
                    } else {
                      icon = (
                        <img
                          key={index}
                          src="/usericon.png"
                          alt="Me"
                          width="30"
                          height="30"
                          className={styles.usericon}
                        />
                      );
                      // The latest message sent by the user will be animated while waiting for a response
                      className =
                        loading && index === messages.length - 1
                          ? styles.usermessagewaiting
                          : styles.usermessage;
                    }
                    return (
                      <Fragment key={`chatMessageWrapper-${index}`}>
                        <div key={`chatMessage-${index}`} className={className}>
                          {icon}
                          <div className={styles.markdownanswer}>
                            <ReactMarkdown linkTarget="_blank">
                              {message.message}
                            </ReactMarkdown>
                          </div>
                        </div>
                        {message.sourceDocs && (
                          <div
                            className="p-5"
                            key={`sourceDocsAccordion-${index}`}
                          >
                            <Accordion
                              type="single"
                              collapsible
                              className="flex-col"
                            >
                              <AccordionItem value={`source`}>
                              <AccordionTrigger className="pt-1">
                                      <h3>Sources</h3>
                              </AccordionTrigger>
                              <AccordionContent>

                               <Accordion
                              type="multiple"
                              className="flex-col"
                            >
                              {message.sourceDocs.map((doc, index) => (
                                <div key={`messageSourceDocs-${index}`}>
                                  <AccordionItem value={`item-${index}`}>
                                    <AccordionTrigger className="pt-1">
                                      <h3>Source {index + 1}</h3>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                      <ReactMarkdown linkTarget="_blank">
                                        {doc.pageContent}
                                      </ReactMarkdown>
                                      <p className="mt-2">
                                        <b>Source:</b> {doc.metadata.source}
                                      </p>
                                    </AccordionContent>
                                  </AccordionItem>
                                </div>
                              ))}
                            </Accordion>
                            </AccordionContent>
                            </AccordionItem>
                            </Accordion>
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
              <div className={styles.center}>
                <div className={styles.cloudform}>
                  <form onSubmit={handleSubmit}>
                    <textarea
                      disabled={loading}
                      onKeyDown={handleEnter}
                      ref={textAreaRef}
                      autoFocus={false}
                      rows={1}
                      maxLength={512}
                      id="userInput"
                      name="userInput"
                      placeholder={
                        loading
                          ? 'Waiting for response...'
                          : 'What is this doc about?'
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className={textAreaClass}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className={styles.generatebutton}
                    >
                      {loading ? (
                        <div className={styles.loadingwheel}>
                          <LoadingDots color="#000" />
                        </div>
                      ) : (
                        // Send icon SVG in input field
                        <svg
                          viewBox="0 0 20 20"
                          className={styles.svgicon}
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                        </svg>
                      )}
                    </button>
                  </form>
                  {error && (
                    <div className="flex flex-row gap-1 mt-1 text-red-500 align-bottom mb-1 w-[75vw]">
                      <BsExclamationTriangleFill className="ml-1 text-xl pt-1" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-row w-full mt-2 m-3 gap-5 justify-end mb-2">
                  <div className="flex gap-1 py-1">
                    Model
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      name="model"
                      id="model"
                      className="border rounded-md pl-1 pr-2 shadow-slate-300 shadow hover:bg-slate-500/10"
                    >
                      <option value="gpt-4-0314">gpt-4-0314</option>
                      <option value="gpt-4">gpt-4</option>
                      <option value="gpt-3.5-turbo-0301">gpt-3.5-turbo-0301</option>
                      <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                      <option value="anthropic" disabled>Anthropic-Claude 100k tokens</option>
                    </select>
                  </div>
                  <div className="flex gap-1 py-1">
                    Algorithm
                    <select
                      value={algo}
                      onChange={(e) => setAlgo(e.target.value)}
                      name="algo"
                      id="algo"
                      className="border rounded-md pl-1 pr-2 shadow-slate-300 shadow hover:bg-slate-500/10"
                    >
                      <option value="ConversationalRetrievalQAChain-lc">
                        ConversationalRetrievalQAChain -LangChain
                      </option>
                      <option value="ConversationalRetrievalChain-lc">
                        ConversationalRetrievalChain -LangChain
                      </option>
                      <option value="Bing" disabled>
                        Bing
                      </option>
                    </select>

                  </div>
                </div>
              </div>
            </main>
          </div>
        ) : (
          <Profile onSetApiKey={setOpenAiApiKey} apiKey={openAiApiKey} onSetAnthropicKey={setAnthropicClaudeKey} anthropicKey={anthropicClaudeKey} onNavigate={handleNavigate} />
        )}
        <footer className="m-auto pt-1">
          <div className="flex flex-row gap-10 text">
            <div className="flex ">Powered by LangChainAI.
            </div>
            <div className="flex gap-1">
              See the <a className="hover:text-slate-600 cursor-pointer" href="https://devfactory.com/privacy-policy/">DevFactory Privacy Policy.</a>
            </div>
          </div>
        </footer>
      </Layout>
    </>
  );
}
