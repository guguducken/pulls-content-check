import core from '@actions/core';
import github from '@actions/github';
import chalk from 'chalk';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toString } from 'mdast-util-to-string'

const githubToken = core.getInput("github_token", { required: true });
const oc = github.getOctokit(githubToken);

async function main() {
    const titleIssue = core.getInput("title_for_find_issue");
    const titleContent = core.getInput("title_for_find_content");

    if (github.context.payload.pull_request === undefined) {
        core.setFailed("the event which trigger this workflow must is pull_request or pull_request_target")
        return 
    }

    const {data: pull} = await oc.rest.pulls.get({
        ...github.context.repo,
        pull_number: github.context.payload.pull_request.number
    })
    const pullContent = pull.body;
    if (pullContent === undefined || pullContent.length == 0) {
        core.setFailed(`this request is not pull_request or the body of this pull_request is empty`);
    }

    console.log("pull content is :" + pullContent)

    let issueIsValid = true
    let contentIsValid = true

    const tree = fromMarkdown(pullContent)

    for (let i = 0; i < tree.children.length; i++) {
        const content = toString(tree.children[i]);
        let inputContent = "";
        switch (content) {
            case titleIssue:
                // i+1 to skip title
                i, inputContent = drumpToNextHeading(tree, i + 1)
                issueIsValid = await checkIssueValid(inputContent);
                continue;
            case titleContent:
                i, inputContent = drumpToNextHeading(tree, i + 1)
                contentIsValid = checkContentValid(inputContent);
                continue;
            default:
                continue;
        }
    }

    core.setOutput("pull_valid", `${issueIsValid && contentIsValid}`)
    if (! (issueIsValid && contentIsValid)) {
        core.setFailed("please add releated issue number(url) under heading `" + chalk.greenBright(titleIssue) + "` and describe the motive of this PR under heading `" + chalk.greenBright(titleContent) + "`")
    }
}

async function checkIssueValid(issueContent) {
    console.log("issue content is: " + chalk.greenBright(issueContent))

    // check issue in this repo
    let regSlef = /#[0-9]+/igm
    let result = issueContent.match(regSlef)
    if (result !== null && result.length != 0) {
        // check weather issue number is valid
        for (let i = 0; i < result.length; i++) {
            // remove prefix #
            const issue = result[i].substring(1);
            console.log("start check issue " + chalk.red(`${issue}`) + " in this repo " + chalk.greenBright(`${github.context.repo.owner}/${github.context.repo.repo}`));
            const { data: data, status: status } = await oc.rest.issues.get({
                ...github.context.repo,
                issue_number: issue
            });
            if (status == 200 && data.pull_request === undefined) {
                console.log("issue " + chalk.red(`${issue}`) + " in this repo " + chalk.greenBright(`${github.context.repo.owner}/${github.context.repo.repo}`) + " is valid, so return true")
                return true
            }

        }
    }

    // check issue in other repo
    const regOther = /https:\/\/github.com\/([a-zA-Z0-9\-_\.]+)\/([a-zA-Z0-9\-_\.]+)\/issues\/(\d+)/igm;
    let resultOtherRepo = issueContent.matchAll(regOther)

    let otherIssue = resultOtherRepo.next();
    let haveNext = !otherIssue.done;
    while (haveNext) {
        console.log(`start check other repo issue ` + chalk.greenBright(otherIssue.value[0]))
        const { data: data, status: status } = await oc.rest.issues.get({
            owner: otherIssue.value[1],
            repo: otherIssue.value[2],
            issue_number: otherIssue.value[3]
        });
        if (status == 200 && data.pull_request === undefined) {
            console.log("issue " + chalk.red(`${otherIssue.value[3]}`) + " in other repo " + chalk.greenBright(`${ otherIssue.value[1]}/${ otherIssue.value[2]}`) + " is valid, so return true")
            return true
        }
        otherIssue = resultOtherRepo.next();
        haveNext = !otherIssue.done;
    }
    console.log(chalk.red("there is no valid issue, so return false"));
    return false
}

function drumpToNextHeading(tree, ind) {
    let content = toString(tree.children[ind],{
        includeHtml: true,
    });
    while (ind + 1 < tree.children.length && tree.children[ind + 1].type != "heading") {
        content += " " + toString(tree.children[++ind],{
            includeHtml: true,
        });
    }
    return ind, content;
}

function checkContentValid(messageContent) {
    console.log("pull message is: " + chalk.greenBright(messageContent));
    messageContent = messageContent.replace("debug", "").replace("fix", "").replace(/<img.*>/igm,"img").replace(/[!"#$%&'()*+,-./:;<=>?@\[\]\^_`{|}~ \\]/igm, "")
    console.log("after replace: " + chalk.red(messageContent))
    console.log(messageContent.length)
    if (messageContent.length >= 3) {
        return true
    }
    return false
}

main();
