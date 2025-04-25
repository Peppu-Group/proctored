<template>
    <div class="col-2 sidebar p-0">
        <div class="p-3">
            <h4>Proctored</h4>
            <div class="mb-3">
                <small>Free tests left: {{ 5 - quizLength }}/5</small>
                <div class="progress">
                    <div class="progress-bar bg-success" role="progressbar" style="width: 95%" aria-valuenow="95"
                        aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <small>Recommended plan: Starter</small>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-3">
                <router-link to="/app" class="link">
                    <h6 class="m-0">Your quizzes ({{ quizLength }})</h6>
                </router-link>
                <button class="btn btn-sm btn-add-quiz" @click="addQuiz()"><i class="bi bi-plus"></i>Add</button>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-3" v-for="quiz in quizList" :key="quiz.form">
                <small>{{ quiz.name }}</small>
                <div class="dropdown">
                    <button class="btn btn-sm btn-add-quiz dropdown-toggle" type="button" data-bs-toggle="dropdown"
                        aria-expanded="false">
                    </button>

                    <div class="dropdown-menu" aria-labelledby="dropdownMenuLink">
                        <a class="dropdown-item" href="#" @click="deleteQuiz(quiz.form, quiz.name)">Delete</a>
                        <a class="dropdown-item" href="#" @click="editQuiz(quiz.form)">Edit</a>
                        <a class="dropdown-item" href="#" @click="getLink(quiz.form)">Get Link</a>
                        <a class="dropdown-item" href="#" @click="getResults(quiz)">Get Results</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import axios from 'axios';
const serverUrl = `https://proctored.server.peppubuild.com`;
import { createQuiz } from '@/utils/swalQuiz';


export default {
    name: 'SideBar',
    computed: {
        quizList() {
            return this.$store.getters.quizList;
        },
        quizLength() {
            return this.$store.getters.quizLength;
        }
    },
    mounted() {
        this.$store.dispatch('loadQuizList'); // Load quiz list on component mount
    },
    methods: {
        getLink(id) {
            this.$router.push({ path: '/form-link', query: { id } })

        },
        addQuiz() {
            createQuiz()
        },
        getResults(quiz) {
            // allow result downloading.
            let endTime = quiz?.end ?? null;
            let timeExpired = false;
            const now = new Date();
            const end = new Date(endTime);
            timeExpired = now >= end;
            this.$router.push({ path: '/student-score', query: { name: quiz.name, time: timeExpired } })
        },
        isCurrentDateTimeAfterEnd(endDateStr) {
            const now = new Date();
            const endDate = new Date(endDateStr);

            return now >= endDate;
        },
        async editQuiz(formIdToEdit) {
            // Retrieve existing quizzes from localStorage
            let quizDetails = localStorage.getItem("quizDetails");
            let parsedQuizDetails = quizDetails ? JSON.parse(quizDetails) : [];

            // Ensure it's an array
            if (!Array.isArray(parsedQuizDetails)) {
                parsedQuizDetails = [];
            }

            // Find the quiz to edit
            const quizIndex = parsedQuizDetails.findIndex(q => q.form === formIdToEdit);

            if (quizIndex === -1) {
                Swal.fire("Error", "Quiz not found!", "error");
                return;
            }

            const existingQuiz = parsedQuizDetails[quizIndex];

            // Show Swal modal for editing
            const { value: formValues } = await Swal.fire({
                title: "Edit Your Quiz",
                html: `
                <small style="color: #6c757d; font-size: 12px;">Fields with red marks are mandatory</small>
                <div style="text-align: left; padding: 10px 5px;">
                    <div style="margin-bottom: 15px;">
                        <label for="quizName" style="display: block; font-weight: 600; margin-bottom: 5px;">Quiz Name: <span style="color: #e74c3c;">*</span></label>
                        <input id="quizName" class="swal2-input" placeholder="Enter Quiz Name" value="${existingQuiz.name}" readonly style="width: 100%; margin: 5px 0;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="formId" style="display: block; font-weight: 600; margin-bottom: 5px;">Form ID: <span style="color: #e74c3c;">*</span></label>
                        <input id="formId" class="swal2-input" placeholder="Enter Form ID" value="${existingQuiz.form}" readonly style="width: 100%; margin: 5px 0; background-color: #f8f9fa;">
                        <small style="color: #6c757d; font-size: 12px;">(Read only)</small>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="quizTime" style="display: block; font-weight: 600; margin-bottom: 5px;">Time Limit (minutes): <span style="color: #e74c3c;">*</span></label>
                        <input id="quizTime" type="number" class="swal2-input" placeholder="Enter Time in Minutes" value="${existingQuiz.time}" style="width: 100%; margin: 5px 0;">
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <label for="startDateTime" style="display: block; font-weight: 600; margin-bottom: 5px;">Start Date & Time:</label>
                        <input id="startDateTime" type="datetime-local" class="swal2-input" style="width: 100%; margin: 5px 0;" min="${new Date().toISOString().slice(0, 16)}" value="${existingQuiz.startDateTime || ''}">
                        <small style="color: #6c757d; font-size: 12px;">(When will this quiz be open to respondents)</small>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <label for="endDateTime" style="display: block; font-weight: 600; margin-bottom: 5px;">End Date & Time:</label>
                        <input id="endDateTime" type="datetime-local" class="swal2-input" style="width: 100%; margin: 5px 0;" min="${new Date().toISOString().slice(0, 16)}" value="${existingQuiz.endDateTime || ''}">
                        <small style="color: #6c757d; font-size: 12px;">(When will this quiz be closed to respondents)</small>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="quizType" style="display: block; font-weight: 600; margin-bottom: 5px;">Select Type: <span style="color: #e74c3c;">*</span></label>
                        <select id="quizType" class="swal2-select" style="width: 100%; margin: 5px 0;">
                        <option value="Google Form" ${existingQuiz.type === "Google Form" ? "selected" : ""}>Google Form</option>
                        </select>
                    </div>
                </div>
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: "Save",
                preConfirm: () => {
                    const quizName = document.getElementById("quizName").value.trim();
                    const quizTime = document.getElementById("quizTime").value.trim();
                    const formId = document.getElementById("formId").value.trim();
                    const quizType = document.getElementById("quizType").value;

                    if (!quizName || !formId || !quizTime || isNaN(quizTime) || quizTime <= 0) {
                        Swal.showValidationMessage("Please enter valid quiz details!");
                        return false;
                    }

                    return { quizName, quizTime, quizType, formId };
                }
            });

            if (formValues) {
                // add temporary data
                const startDateTime = document.getElementById("startDateTime").value.trim();
                const endDateTime = document.getElementById("endDateTime").value.trim();

                // Update quiz details
                const updatedQuiz = {
                    name: formValues.quizName,
                    form: formValues.formId,
                    time: formValues.quizTime,
                    type: formValues.quizType,
                    date: new Date().toISOString() // Store current date
                };

                // Include optional fields if they have values
                if (startDateTime) {
                    updatedQuiz.start = startDateTime;
                }

                if (endDateTime) {
                    updatedQuiz.end = endDateTime;
                }

                // Update the quiz details in the array
                parsedQuizDetails[quizIndex] = updatedQuiz;

                // Dispatch the action to update the quiz
                this.$store.dispatch('editQuiz', updatedQuiz);
            }
        },
        async deleteQuiz(formIdToDelete, sheetName) {
            Swal.fire({
                title: "Are you sure you want to delete this quiz?",
                showCancelButton: true,
                confirmButtonText: "Delete",
            }).then((result) => {
                if (result.isConfirmed) {
                    this.$store.dispatch('removeQuiz', {
                        formIdToDelete,
                        sheetName
                    });
                }
            });

        }


    }
}
</script>

<style>
.link {
    text-decoration: none;
    /* Removes underline */
    color: inherit;
    /* Makes the link inherit the text color */
}

.btn-add-quiz {
    background-color: #10b981;
    color: white;
}
</style>