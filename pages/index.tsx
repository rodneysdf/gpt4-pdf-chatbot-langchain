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
  getCollection,
  makePostChat,
  postPurgeDocuments,
  postSendUrl,
  postUploadFiles,
} from '@/utils/api';
import { Document } from 'langchain/document';
import { useEffect, useRef, useState } from 'react';
import { BsPersonCircle } from 'react-icons/bs';
import ReactMarkdown from 'react-markdown';

const DocumentUpload = () => {
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
      console.log("starting")

      await postUploadFiles(files, auth);
      console.log("done")
      e.target.value = null;
    } catch (err: any) {
      alert('an error occured uploading the documents');
      console.log('err', err.response);
    }
    setLoading(true);
    console.log("setLoading true")


    setTimeout(() => {
      setLoading(false);
      console.log("timeout complete")
    }, 5000);
  };

  return (
    <div>
      <button
        onClick={() => openFileDialog()}
        className="border px-2 py-1 rounded-md w-40"
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
    </div>
  );
};

const AddUrl = () => {
  const auth = useAuth();

  const [loading, setLoading] = useState(false);

  const promptForUrl = () => {
    const url = prompt('Please enter a url');

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
      await postSendUrl(url, auth);
    } catch (err: any) {
      alert('an error occured purging the documents');
      console.log('err', err.response);
    }

    setLoading(false);
  };

  return (
    <button onClick={promptForUrl} className="border px-2 py-1 rounded-md w-40">
      {loading ? <LoadingDots color="#000" /> : 'Add url'}
    </button>
  );
};

const PurgeDocuments = () => {
  const [loading, setLoading] = useState(false);
  const auth = useAuth();

  const purgeDocuments = async () => {
    setLoading(true);

    try {
      await postPurgeDocuments(auth);
    } catch (err: any) {
      alert('an error occured purging the documents');
      console.log('err', err.response);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={purgeDocuments}
      className="border px-2 py-1 rounded-md w-40"
    >
      {loading ? <LoadingDots color="#000" /> : 'Purge collection'}
    </button>
  );
};

const Profile = (props: any) => {
  const { apiKey, onSetApiKey } = props;
  const auth = useAuth();

  const handleSetApiKey = (apiKey: string) => {
    window.localStorage.setItem('openai-api-key', apiKey);
    onSetApiKey(apiKey);
  };

  return (
    <div className="flex flex-col  w-2/3 self-center rounded-2xl bg-gray-100 p-4">
      <div className="flex flex-row gap-3 text-xl font-bold mb-4">
        <BsPersonCircle className="text-2xl" /> Profile
      </div>
      <p className="text-xl">Email: {auth.user?.attributes.email}</p>
      <br />
      <br />
      Use my own OpenAI API key:
      <br />
      <input
        className="border px-2 py-1 rounded-md w-40"
        type="text"
        onChange={(e) => handleSetApiKey(e.target.value)}
        value={apiKey}
      />
      <div className="flex flex-row gap-3 mt-4">
        <PurgeDocuments />
      </div>
      <div className="flex flex-row gap-3 mt-4">
        <button
          onClick={() => {
            auth.signOut();
            onSetApiKey('');
          }}
          className="border px-2 py-1 rounded-md w-40"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};

export default function Home() {
  const auth = useAuth();
  const [model, setModel] = useState<string>('gpt-3.5-turbo');
  const [algo, setAlgo] = useState<string>(
    'LangChain ConversationalRetrievalQAChain',
  );
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<{
    messages: Message[];
    pending?: string;
    history: [string, string][];
    pendingSourceDocs?: Document[];
  }>({
    messages: [
      {
        message: 'Hi, what would you like to know about these documents?',
        type: 'apiMessage',
      },
    ],
    history: [],
  });

  const { messages, history } = messageState;

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const postChat = makePostChat(
    {
      onSuccess(data, question) {
        setMessageState((state) => ({
          ...state,
          messages: [
            ...state.messages,
            {
              type: 'apiMessage',
              message: data.text,
              sourceDocs: data.sourceDocuments,
            },
          ],
          history: [...state.history, [question, data.text]],
        }));

        setLoading(false);
        messageListRef.current?.scrollTo(
          0,
          messageListRef.current.scrollHeight
        );
      },
      onError(response) {
        setLoading(false);
        setError('An error occurred while fetching the data. Please try again.');
        console.log('error', response);
      },
    },
    auth
  );

  //handle form submission
  async function handleSubmit(e: any) {
    e.preventDefault();

    setError(null);

    if (!query) {
      alert('Please input a question');
      return;
    }

    const question = query.trim();

    setMessageState((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          type: 'userMessage',
          message: question,
        },
      ],
    }));

    setLoading(true);
    setQuery('');

    postChat({
      model,
      algo,
      question,
      history,
      openAiKey: '',
    });
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

  useEffect(() => {
    const storedApiKey = window.localStorage.getItem('openai-api-key') || '';
    setOpenAiApiKey(storedApiKey);
  }, [setOpenAiApiKey]);

  useEffect(() => {
    const getUserProfile = async () => {
      if (auth && auth.user) {
        try {
          const response = await getCollection(auth);

          if (response) {
            if (response.data.size) {
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
  }, [auth]);

  const [collectionSize, setCollectionSize] = useState<number | null>(0);

  return (
    <>
      <Layout onNavigate={handleNavigate} apiKey={openAiApiKey}>
        {page === 'home' ? (
          <div className="mx-auto flex flex-col gap-4">
            <div className="flex flex-col bg-slate-400/10 p-1 rounded-md border">
              <div className="text-lg font-bold mt-0 m-2">
                Collection
                {collectionSize ? (
                  <span className="text-sm font-normal ml-2">
                    Size: ({collectionSize} chunks)
                  </span>
                ) : null}
              </div>
              <div className="flex flex-row gap-3 ml-2 mb-2">
                <DocumentUpload />
                <AddUrl />
                <PurgeDocuments />
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
                      <>
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
                              {message.sourceDocs.map((doc, index) => (
                                <div key={`messageSourceDocs-${index}`}>
                                  <AccordionItem value={`item-${index}`}>
                                    <AccordionTrigger>
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
                          </div>
                        )}
                      </>
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
                      className={styles.textarea}
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
                </div>
                <div className="flex flex-row  w-full mt-3 m-3 gap-3 justify-end">
                  <div className="flex gap-3">
                    Model
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      name="model"
                      id="model"
                      className="border px-2 py-1 rounded-md"
                    >
                      <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                      <option value="gpt-4">gpt-4</option>
                      <option value="gpt-3.5-turbo-0301">
                        gpt-3.5-turbo-0301
                      </option>
                      <option value="gpt-4-0314">gpt-4-0314</option>
                      <option value="clyde">Anthropic-Clyde</option>
                    </select>
                  </div>
                  <div className="flex gap-3">
                    Algorithm:{' '}
                    <select
                      value={algo}
                      onChange={(e) => setAlgo(e.target.value)}
                      name="algo"
                      id="algo"
                      className="border px-2 py-1 rounded-md w-64"
                    >
                      <option value="lc-CRQAC">
                        LangChain ConversationalRetrievalQAChain
                      </option>
                      <option value="lc-CRC">
                        LangChain ConversationalRetrievalChain
                      </option>
                      <option value="Bing" disabled>
                        Bing
                      </option>
                    </select>

                  </div>
                </div>
              </div>

              {error && (
                <div className="border border-red-400 rounded-md p-4 m-3">
                  <p className="text-red-500">{error}</p>
                </div>
              )}
            </main>
          </div>
        ) : (
          <Profile onSetApiKey={setOpenAiApiKey} apiKey={openAiApiKey} />
        )}
        <footer className="m-auto p-4">
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
