// src/store.js

import { createStore } from 'vuex';
import Swal from 'sweetalert2';
import axios from 'axios';

const serverUrl = `https://proctoredserver.peppubuild.com`;
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
            let email = localStorage.getItem('email');
            return state.currentQuiz ? `https://proctored.peppubuild.com/getmail/${state.currentQuiz.form}?name=${state.currentQuiz.name}&email=${email}` : '';
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
                }
            } catch (err) {
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
                    }
                } catch (err) {
                    this.$router.push({ path: '/login' })
                }
            } else {
                // fetch refreshtoken from json file.
                this.$router.push({ path: '/login' })
            }
        },

        async loadQuizList({ commit, state, dispatch }) {
            await dispatch('initAccessToken');
            try {
                const res = await axios.get(`${serverUrl}/get-proctored/${state.accessToken}`);
                const proctoredData = res.data.data;
                commit('setQuizList', proctoredData);
            } catch (err) {
                // Swal.fire("We couldn't get your quiz!", `This could be because you have no quiz, or from your network connection`, "info");
            }
        },

        async addQuiz({ commit, state, dispatch }, quizData) {
            await dispatch('initAccessToken');
            let parsedQuizDetails = state.quizList;

            if (!Array.isArray(parsedQuizDetails)) parsedQuizDetails = [];

            // Validate that quizData.name is not empty or just whitespace
            if (!quizData.name || quizData.name.trim().length === 0) {
                Swal.fire('Missing Name', 'Please, only named forms are accepted. Name your form before adding them to your dashboard.', 'warning');
                return;
            }

            // Check for duplicates based on form ID or quiz name (case-insensitive)
            const isDuplicate = parsedQuizDetails.some(q =>
                q.form === quizData.form || q.name.trim().toLowerCase() === quizData.name.trim().toLowerCase()
            );

            if (isDuplicate) {
                Swal.fire('Duplicate Found!', 'A quiz with this form ID or name already exists. Please edit the existing quiz or choose a different form.', 'info');
                return;
            }

            if (!isDuplicate) {
                parsedQuizDetails.push(quizData);
                commit('setQuizList', parsedQuizDetails);
                console.log(state.quizList)
                console.log(parsedQuizDetails)
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
            commit('removeQuiz', formIdToDelete);
            commit('setCurrentQuiz', null);
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
                    updatedProctoredData: state.quizList
                });
                // Show success message
                Swal.fire("Success!", "Quiz details updated!", "success");
            } catch (err) {
                Swal.fire("Error!", `Couldn't update quiz: ${err}`, "error");
            }
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
