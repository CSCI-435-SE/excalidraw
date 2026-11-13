**Code PR:** [feat(editor): implement group object functionality (#84)](https://github.com/CSCI-435-SE/excalidraw/pull/170) (open, awaiting review)

## What have you implemented so far, and what remains?

So far I have made a PR for my first issue (feat(editor): implement group object functionality (#84)). I still need to get that PR approved, and I need to begin working on and complete my second issue for the sprint. The issue that I complete made everyone who edits an element its co-owner, and makes the element follow the least restricted of its owners: it stays visible, and editable, as long as at least one co-owner is. It also changed collaborative behavior such as making the last change win (instead of the version that was changed the most ahead).

## What is one thing you learned about testing in your project?

One thing that I learned about testing in my project is that the tests are fairly hierarchical, so it is relatively easy to extend the existing ones when new features/functionalities are added. I also learned that there are certain cases that are not tested for, because of the way that certain things were implemented that should prevent those errors from occurring, but slightly tweaking certain things changes that behavior, and thus test cases have to be added. Also, certain functionality (such as Elements whose deletion was older than 24 hours could come back) wasn’t really tested for, so it seems there wasn’t strong direction on how certain things should behave, and their behavior was just accepted.

## What is one risk to finishing your work by Nov 19, and what will you do about it?

One risk is that I will rush the work and take cheap short cuts that will be detrimental to the health of the project in the long-run. For example, in this sprint, I built off of the existing functionality (using the existing way that different edits are merged and slightly changing it, instead of implementing an entirely new system). This may lead to me introducing more technical debt (ex. changes made at the same time on two devices whose clocks disagree, before they've exchanged anything, are still ordered by