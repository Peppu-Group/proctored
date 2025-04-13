// src/store.js

import { createStore } from 'vuex';
import Swal from 'sweetalert2';
import axios from 'axios';

const serverUrl = `http://localhost:3000`;
const refreshToken = localStorage.getItem('refreshToken') || null;

const store = createStore({
    state() {
        const storedData = localStorage.getItem('quizDetails');
        let quizList = [];
        if (storedData) {
            quizList = JSON.parse(storedData);
        }

        return {
            quizList,
            quizLength: quizList.length,
            currentQuiz: null,
            accessToken: localStorage.getItem('authToken') || null,
        };

    },
    mutations: {
        setQuizList(state, newQuizList) {
            state.quizList = newQuizList;
            state.quizLength = newQuizList.length;
            localStorage.setItem('quizDetails', JSON.stringify(newQuizList));
        },
        setCurrentQuiz(state, quiz) {
            state.currentQuiz = quiz;
            localStorage.setItem('currentQuiz', JSON.stringify(quiz));
        },
        addQuiz(state, newQuiz) {
            state.quizList.push(newQuiz);
            state.quizLength = state.quizList.length;
            localStorage.setItem('quizDetails', JSON.stringify(state.quizList));
        },
        removeQuiz(state, quizId) {
            state.quizList = state.quizList.filter(quiz => quiz.form !== quizId);
            state.quizLength = state.quizList.length;
            localStorage.setItem('quizDetails', JSON.stringify(state.quizList));
        },
        setAccessToken(state, token) {
            state.accessToken = token;
            localStorage.setItem('authToken', token);
        },
        UPDATE_QUIZ(state, updatedQuiz) {
            const index = state.quizList.findIndex(quiz => quiz.form === updatedQuiz.form);
            if (index !== -1) {
              // Replace the existing quiz with the updated one
              state.quizList.splice(index, 1, updatedQuiz);
            }
        }
    },

    actions: {
        formLink({ state }) {
            return state.currentQuiz ? `http://127.0.0.1:5173/getmail/${state.currentQuiz.form}?name=${state.currentQuiz.name}` : '';
        },

        async initAccessToken({ commit, dispatch }) {
            const token = localStorage.getItem('authToken');
            if (!token) {
                console.warn('No authToken found.');
                return;
            }

            try {
                const res = await axios.get(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
                if (res.data) {
                    commit('setAccessToken', token);
                    console.log('Access token validated and set');
                }
            } catch (err) {
                console.warn('Token invalid, refreshing...');
                await dispatch('refreshAccessToken');
            }
        },

        async refreshAccessToken({ commit }) {
            if (refreshToken) {
                try {
                    const res = await axios.get(`${serverUrl}/refresh-token/${refreshToken}`);
                    const newToken = res.data.accessToken;
                    if (newToken) {
                        commit('setAccessToken', newToken);
                        console.log('Refreshed and saved new access token');
                    }
                } catch (err) {
                    console.error('Failed to refresh access token:', err);
                }
            } else {
                // do something to remove access to peppubuild so that the user will get accessToken and clear accessToken
            }
        },

        async loadQuizList({ commit, state, dispatch }) {
            const storedData = localStorage.getItem('quizDetails');
            if (storedData) {
                commit('setQuizList', JSON.parse(storedData));
            } else {
                await dispatch('initAccessToken');
                try {
                    const res = await axios.get(`${serverUrl}/get-proctored/${state.accessToken}`);
                    const proctoredData = res.data.data;
                    commit('setQuizList', proctoredData);
                } catch (err) {
                    Swal.fire("Error!", `An error occurred, could be your network connection: ${error}`, "error");
                }
            }
        },

        async addQuiz({ commit, state, dispatch }, quizData) {
            await dispatch('initAccessToken');
            let parsedQuizDetails = state.quizList;

            if (!Array.isArray(parsedQuizDetails)) parsedQuizDetails = [];

            const isDuplicate = parsedQuizDetails.some(q => q.form === quizData.form);
            if (!isDuplicate) {
                parsedQuizDetails.push(quizData);
                commit('setQuizList', parsedQuizDetails);
                let bodyData = [quizData];
                let sheetName = quizData.name;

                Swal.fire({
                    title: 'Creating quizzes...',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                try {
                    await axios.post(`${serverUrl}/create-project`, {
                        accessToken: state.accessToken,
                        sheetName,
                        bodyData
                    });

                    Swal.fire("Created!", "The quiz has been added.", "success");
                } catch (error) {
                    Swal.fire("Error!", `An error occurred: ${error}`, "error");

                }

                Swal.fire('Success', 'Quiz added successfully!', 'success');
            } else {
                Swal.fire('Duplicate Found!', 'Quiz already added, edit settings instead!', 'info');
            }
        },

        async removeQuiz({ commit, dispatch, state }, { formIdToDelete, sheetName }) {
            // Ensure access token is available
            await dispatch('initAccessToken');

            const accessToken = state.accessToken;
            const updatedProctoredData = state.quizList;

            Swal.fire({
                title: 'Deleting quiz...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            try {
                await axios.post(`${serverUrl}/delete-sheet/${accessToken}`, {
                    sheetName,
                    updatedProctoredData,
                });

                commit('removeQuiz', formIdToDelete);
                commit('setCurrentQuiz', null);

                // Clear related localStorage
                Swal.fire('Deleted!', 'The quiz has been removed.', 'success');
            } catch (err) {
                Swal.fire('Error!', `An error occurred: ${err.message}`, 'error');
            }
        },
        async editQuiz({ commit, dispatch, state }, updatedQuiz) {
            // update quizDetails in json file.
            await dispatch('initAccessToken');
            commit('UPDATE_QUIZ', updatedQuiz);
            // Persist the updated quiz list to localStorage
            localStorage.setItem('quizDetails', JSON.stringify(state.quizList));
            
            try {
                await axios.post(`${serverUrl}/edit-quiz/${state.accessToken}`, {
                    updatedProctoredData: state.quizList});
            } catch (err) {
                Swal.fire("Error!", `Couldn't update quiz: ${err}`, "error");
            }
            console.log(state.quizList)

        }
    },

    getters: {
        quizList: state => state.quizList,
        quizLength: state => state.quizLength,
        currentQuiz: state => state.currentQuiz,
        accessToken: state => state.accessToken,
    }
});

export default store;
