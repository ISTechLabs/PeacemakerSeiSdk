// boilerplate code

import React, { useState, useCallback, useEffect, FC } from 'react';
import { useSigningCosmWasmClient, useWallet, useSelectWallet, useCosmWasmClient } from '@sei-js/react';
import { UnityEvent } from './Peacemaker';
import { ReactUnityEventParameter } from 'react-unity-webgl/distribution/types/react-unity-event-parameters';

interface SeiAgentProps {
    timeoutMs: number;
    eventQueue: UnityEvent[];
    setEventQueue: React.Dispatch<React.SetStateAction<UnityEvent[]>>;
    sendMessage: (gameObjectName: string, methodName: string, parameter?: ReactUnityEventParameter) => void;
    isLoaded: boolean;
}

const SeiAgent: FC<SeiAgentProps> = ({ eventQueue, setEventQueue, timeoutMs = 30_000, sendMessage, isLoaded }) => {
    const { connectedWallet, accounts, chainId } = useWallet();
    const [timeoutHandler, setTimeoutHandler] = useState<NodeJS.Timeout | null>(null);
    const { openModal, closeModal } = useSelectWallet();
    const [resolvePromise, setResolvePromise] = useState<((value: any) => void) | null>(null);
    const { cosmWasmClient: queryClient } = useCosmWasmClient();
    const { signingCosmWasmClient: signingClient } = useSigningCosmWasmClient();

    const sendMessageToUnity = useCallback(
        (payload: string) => {
            try {
                sendMessage('SeiSdkManager', 'WebResponse', payload);
            } catch (error: any) {
                console.error('Error sending message to Unity:', error);
            }
        },
        [isLoaded, sendMessage]
    );

    const onLoginCallback = useCallback(
        async (requestId: string, accountAddress: string, error: any) => {
            sendMessageToUnity(
                JSON.stringify({
                    Id: requestId,
                    Response: !error
                        ? JSON.stringify({
                              WalletAddress: accountAddress,
                          })
                        : '',
                    Error: error ? error?.message : '',
                })
            );
        },
        [sendMessageToUnity]
    );

    const onExecuteCallback = useCallback(
        async (requestId: string, response: any, error: any) => {
            sendMessageToUnity(
                JSON.stringify({
                    Id: requestId,
                    Response: !error ? JSON.stringify(response) : '',
                    Error: error ? error?.message : '',
                })
            );
        },
        [sendMessageToUnity]
    );

    const onQueryCallback = useCallback(
        async (requestId: string, response: any, error: any) => {
            sendMessageToUnity(
                JSON.stringify({
                    Id: requestId,
                    Response: !error ? JSON.stringify(response) : '',
                    Error: error ? error?.message : '',
                })
            );
        },
        [sendMessageToUnity]
    );

    const processEventQueue = useCallback(async () => {
        while (eventQueue.length > 0) {
            const event = eventQueue.shift();
            if (event && event.name === 'OnLogin') {
                if (connectedWallet) {
                    onLoginCallback(event.id, accounts[0]?.address, 'Already logged in');
                    continue;
                }
                openModal();
                try {
                    const walletAddress: string = await new Promise<string>((resolve, reject) => {
                        const handler = setTimeout(() => {
                            setEventQueue([]);
                            closeModal();
                            reject(new Error('Timeout'));
                        }, timeoutMs);
                        setTimeoutHandler(handler);
                        setResolvePromise(() => resolve);
                    });
                    onLoginCallback(event.id, walletAddress, '');
                } catch (error: any) {
                    console.error('Error on login:', error);
                    onLoginCallback(event.id, '', error?.message || 'Unknown');
                }
            } else if (event && event.name === 'OnLogout') {
                // TODO: implement logout
                continue;
            } else if (event && event.name === 'OnQuery') {
                try {
                    const response = await queryClient?.queryContractSmart(
                        event.data.ContractAddress,
                        event.data.Query
                    );
                    onQueryCallback(event.id, response, '');
                } catch (error: any) {
                    console.error('Error on query:', error);
                    onQueryCallback(event.id, '', error?.message || 'Unknown');
                }
            } else if (event && event.name === 'OnExecute') {
                if (!signingClient) {
                    console.error('signingClient is not ready');
                    onExecuteCallback(event.id, '', 'Signing client unavailable');
                    continue;
                }
                try {
                    await signingClient.execute(
                        event.data.SenderAddress,
                        event.data.ContractAddress,
                        event.data.Message,
                        event.data.Fee
                    );
                    onExecuteCallback(event.id, '', '');
                } catch (error: any) {
                    console.error('Error on execute:', error);
                    onExecuteCallback(event.id, '', error?.message || 'Unknown');
                }
            }
        }
        setEventQueue([]);
    }, [onLoginCallback, onExecuteCallback, onQueryCallback]);

    useEffect(() => {
        if (!!connectedWallet && !!resolvePromise) {
            timeoutHandler && clearTimeout(timeoutHandler);
            setTimeoutHandler(null);
            resolvePromise(accounts[0]?.address || '');
        }
    }, [resolvePromise, connectedWallet]);

    useEffect(() => {
        if (eventQueue.length > 0) {
            processEventQueue();
        }
    }, [eventQueue]);

    return <div></div>;
};

export default SeiAgent;
