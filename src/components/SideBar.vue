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
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import axios from 'axios';
const serverUrl = `http://localhost:3000`;
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
                <div style="text-align: left; padding: 10px 5px;">
                    <div style="margin-bottom: 15px;">
                        <label for="quizName" style="display: block; font-weight: 600; margin-bottom: 5px;">Quiz Name:</label>
                        <input id="quizName" class="swal2-input" placeholder="Enter Quiz Name" value="${existingQuiz.name}" style="width: 100%; margin: 5px 0;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="formId" style="display: block; font-weight: 600; margin-bottom: 5px;">Form ID:</label>
                        <input id="formId" class="swal2-input" placeholder="Enter Form ID" value="${existingQuiz.form}" readonly style="width: 100%; margin: 5px 0; background-color: #f8f9fa;">
                        <small style="color: #6c757d; font-size: 12px;">(Read only)</small>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="quizTime" style="display: block; font-weight: 600; margin-bottom: 5px;">Time Limit (minutes):</label>
                        <input id="quizTime" type="number" class="swal2-input" placeholder="Enter Time in Minutes" value="${existingQuiz.time}" style="width: 100%; margin: 5px 0;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="quizType" style="display: block; font-weight: 600; margin-bottom: 5px;">Select Type:</label>
                        <select id="quizType" class="swal2-select" style="width: 100%; margin: 5px 0;">
                        <option value="Google Form" ${existingQuiz.type === "Google Form" ? "selected" : ""}>Google Form</option>
                        </select>
                    </div>
                </div>`,
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
                // Update quiz details
                parsedQuizDetails[quizIndex] = {
                    name: formValues.quizName,
                    form: formValues.formId,
                    time: formValues.quizTime,
                    type: formValues.quizType,
                    date: new Date().toISOString() // Store current date
                };

                // Save updated quizzes back to localStorage
                localStorage.setItem("quizDetails", JSON.stringify(parsedQuizDetails));
                this.$store.commit('setQuizList', parsedQuizDetails);
                // now, update the json file.

                // Show success message
                Swal.fire("Success!", "Quiz details updated!", "success");
            }
        },
        async deleteQuiz(formIdToDelete, sheetName) {
            this.$store.dispatch('removeQuiz', {
                formIdToDelete,
                sheetName
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