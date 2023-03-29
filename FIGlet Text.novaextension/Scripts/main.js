/**
 * Convert the supplied text to FIGlet format
 *
 * @param workspace - Workspace, default first argument, see Nova extension docs
                      https://docs.nova.app/api-reference/commands-registry/#registername-callable-thisvalue
 * @param figletArgs - key/value obj, command line arguments for FIGlet configuration
 * @param textToConvert - str, the text to convert with FIGlet
 * @param postConversion - func, callback to run on the figlet converted text string,
                           receives the FIGlet converted string as an argument;
                           output/modification of the FIGlet text should be done here
 * @returns a Disposable, see Nova extension docs https://docs.nova.app/api-reference/disposable/
 */
nova.commands.register('figlet', (workspace, figletArgs, textToConvert, postConversion) => {
    const fontSubDir = nova.config.get('figlet_text.font', 'string').match(/^.*\/\s*/)
    const fontDir = () => {
        if ( fontSubDir !== null) {
            return '/usr/local/Cellar/figlet/2.2.5/share/figlet/fonts/' + fontSubDir
        }
        return '/usr/local/Cellar/figlet/2.2.5/share/figlet/fonts/'
    }

    let args = ['figlet']
    for (const arg in figletArgs) {
        args.push(figletArgs[arg])
    }

    args.push(
        '-d', fontDir(),
        '-f', nova.config.get('figlet_text.font', 'string').replace(fontSubDir, ''),
        textToConvert
    )

    const process = new Process('/usr/bin/env', {args})

    let figTextArr = []
    process.onStdout(line => {
        // test if a line contains only whitespace, some
        // FIGlet fonts will add a line or two for fun
        if (!/^\s+$/.test(line)) {
            figTextArr.push(line)
        }
    })

    let figTextStr = ''
    process.onDidExit(status => {
        if (status === 0) {
            // trim any whitespace from the end of each line; FIGlet seems
            // to add a single column of whitespace more than what is required
            figTextArr = figTextArr.map(line => { return line.trimEnd() })

            // convert to a string
            figTextStr = figTextArr.join('\n')
            postConversion(figTextStr)
        }
    })

    process.start()
})


// FIGlet convert the selected text in the editor
nova.commands.register('figletTextEditor', editor => {
    let figConfig = {
        outputWidth:     '-w' + nova.config.get('figlet_text.outputWidth', 'number'),
        textDirection:   nova.config.get('figlet_text.textDirection', 'string'),
        justification:   nova.config.get('figlet_text.justification', 'string'),
    }

    let bordersEnabled = nova.config.get('figlet_text.borders', 'boolean')
    let borders = {
        top: {
            width: nova.config.get('figlet_text.borderTopWidth', 'number'),
            padding: nova.config.get('figlet_text.borderTopPadding', 'number'),
            char: nova.config.get('figlet_text.borderTopChar', 'string'),
        },
        right: {
            width: nova.config.get('figlet_text.borderRightWidth', 'number'),
            padding: nova.config.get('figlet_text.borderRightPadding', 'number'),
            char: nova.config.get('figlet_text.borderRightChar', 'string'),
        },
        bottom: {
            width: nova.config.get('figlet_text.borderBottomWidth', 'number'),
            padding: nova.config.get('figlet_text.borderBottomPadding', 'number'),
            char: nova.config.get('figlet_text.borderBottomChar', 'string'),
        },
        left: {
            width: nova.config.get('figlet_text.borderLeftWidth', 'number'),
            padding: nova.config.get('figlet_text.borderLeftPadding', 'number'),
            char: nova.config.get('figlet_text.borderLeftChar', 'string'),
        }
    }

    let commentsEnabled = nova.config.get('figlet_text.comment', 'boolean')
    let commentType = nova.config.get('figlet_text.commentType', 'string')
    let commentPadding = {
        block: nova.config.get('figlet_text.commentPaddingBlock', 'number'),
        inline: nova.config.get('figlet_text.commentPaddingInline', 'number')
    }
    let commentPaddingStr = nova.config.get('figlet_text.commentPaddingStr', 'string')
    const getCommentChars = () => {
        switch (editor.document.syntax) {
            case 'css':
            case 'scss':
                return {block: {start: '/*', end: '*/'}, inline: {start: '/*', end: '*/'}}
            case 'html':
                return {block: {start: '<!--', end: '-->'}, inline: {start: '<!--', end: '-->'}}
            case 'javascript':
            case 'typescript':
            case 'php':
                return {block: {start: '/*', end: '*/'}, inline: {start: '//', end: ''}}
            default:
                return null
        }
    }

    let marginsEnabled = nova.config.get('figlet_text.margins', 'boolean')
    let prependNewLines = nova.config.get('figlet_text.prependNewLines', 'number')
    let appendNewLines = nova.config.get('figlet_text.appendNewLines', 'number')

    let selectedRanges = editor.selectedRanges.reverse()

    for (let range of selectedRanges) {
        // the text to be processed
        let text = editor.getTextInRange(range)

        // get the range of the start of the line with selection to the start of
        // the selection and calculate the amount of characters for indentation
        let indentRange = new Range(editor.getLineRangeForRange(range).start, range.start)
        const indentText = (() => {
            let charCount = editor.getTextInRange(indentRange).length
            return ' '.repeat(charCount)
        })()

        nova.commands.invoke('figlet', figConfig, text, figletText => {
            // convert the FIGlet string to an array of strings to make it
            // easier to modify line by line; order of transformations matter
            let figletTextArr = figletText.split('\n')

            // add borders/padding if the option is enabled
            if (bordersEnabled) {
                let longestLine = 0
                figletTextArr.map(line => { if (line.length > longestLine) longestLine = line.length })

                let additionalWidth = ((borders.left.width * borders.left.char.length) + borders.left.padding) + ((borders.right.width * borders.right.char.length) + borders.right.padding)

                // top/bottom transformations need to be buffered and applied
                // after left/right transformations which are done line by and
                // are affected by top/bottom transformations if done in place
                let borderBuffer = { paddingTop: [], paddingBottom: [], widthTop: [], widthBottom: [] }

                for (const border in borders) {
                    if (borders[border].padding > 0) {
                        switch (border) {
                            case 'left':
                                figletTextArr = figletTextArr.map(line => {
                                    if (!/^\s+$/.test(line)) return `${' '.repeat(borders.left.padding)}${line}`
                                })
                                break
                            case 'right':
                                figletTextArr = figletTextArr.map(line => {
                                    // nova.commands.register.figlet trims whitespace
                                    // per line; they will not all be the same length
                                    let additionalRightPadding = (borders.left.padding + longestLine + borders.right.padding) - (borders.left.padding + line.length + borders.right.padding)

                                    if (!/^\s+$/.test(line)) {
                                        if (additionalRightPadding > 0) line = `${line}${' '.repeat(additionalRightPadding)}`
                                        return `${line}${' '.repeat(borders.right.padding)}`
                                    }
                                })
                                break
                            case 'top':
                                if (borders.left.width === 0 && borders.right.width === 0) {
                                    // subtract one; will Array.prototype.join('\n') before final editor output
                                    borderBuffer.paddingTop.push([`${'\n'.repeat(borders.top.padding - 1)}`])
                                } else {
                                    for (let count = borders.top.padding; count; count--) {
                                        borderBuffer.paddingTop.push(
                                            borders.left.char.repeat(borders.left.width) + ' '.repeat(longestLine + borders.left.padding + borders.right.padding) + borders.left.char.repeat(borders.right.width)
                                        )
                                    }
                                }
                                break
                            case 'bottom':
                                if (borders.left.width === 0 && borders.right.width === 0) {
                                    // subtract one; will Array.prototype.join('\n') before final editor output
                                    borderBuffer.paddingBottom.push([`${'\n'.repeat(borders.bottom.padding - 1)}`])
                                } else {
                                    for (let count = borders.bottom.padding; count; count--) {
                                        borderBuffer.paddingBottom.push(
                                            borders.left.char.repeat(borders.left.width) + ' '.repeat(longestLine + borders.left.padding + borders.right.padding) + borders.left.char.repeat(borders.right.width)
                                        )
                                    }
                                }
                                break
                        }
                    }

                    if (borders[border].width > 0) {
                        switch (border) {
                            case 'left':
                                figletTextArr = figletTextArr.map(line => {
                                    if (!/^\s+$/.test(line)) { return `${borders[border].char.repeat(borders[border].width)}${line}` }
                                })
                                break
                            case 'right':
                                figletTextArr = figletTextArr.map(line => {
                                    // nova.commands.register.figlet trims whitespace
                                    // per line; they will not all be the same length
                                    let additionalRightPadding = (borders.left.padding + longestLine + borders.right.padding) - (borders.left.padding + line.length + borders.right.padding)

                                    if (!/^\s+$/.test(line)) {
                                        if (additionalRightPadding > 0) line = `${line}${' '.repeat(additionalRightPadding)}`
                                        return `${line}${borders[border].char.repeat(borders[border].width)}`
                                    }
                                })
                                break
                            case 'top':
                                for (let count = 0; count < borders[border].width; count++) {
                                    borderBuffer.widthTop.push(`${borders[border].char.repeat(longestLine + additionalWidth)}`)
                                }
                                break
                            case 'bottom':
                                for (let count = 0; count < borders[border].width; count++) {
                                    borderBuffer.widthBottom.push(`${borders[border].char.repeat(longestLine + additionalWidth)}`)
                                }
                                break
                        }
                    }
                }

                if (!borderBuffer.paddingTop.empty) figletTextArr = borderBuffer.paddingTop.concat(figletTextArr)
                if (!borderBuffer.paddingBottom.empty) figletTextArr = figletTextArr.concat(borderBuffer.paddingBottom)
                if (!borderBuffer.widthTop.empty) figletTextArr = borderBuffer.widthTop.concat(figletTextArr)
                if (!borderBuffer.widthBottom.empty) figletTextArr = figletTextArr.concat(borderBuffer.widthBottom)
            }

            // comment each line if the option is enabled and a
            // comment structure is defined for the current syntax
            if (commentsEnabled && getCommentChars() !== null) {
                switch (commentType) {
                    case 'inline':
                        // find the longest line so we can add whitespace to shorter
                        // lines so closing comments line up if the syntax uses them
                        let longestLine = 0
                        figletTextArr.map(line => { if (line.length > longestLine) longestLine = line.length })

                        // add the comment characters, lengthen lines with closing
                        // comments, and add user configured comment padding
                        figletTextArr = figletTextArr.map(line => {
                            let linePadding = 0
                            if (line.length < longestLine && (getCommentChars().end !== '')) linePadding = longestLine - line.length

                            // return the commented line if not whitespace
                            if (/^\s+$/.test(line)) return '\n'
                            return `${getCommentChars().inline.start}${commentPaddingStr.repeat(commentPadding.inline)}${line}${' '.repeat(linePadding)}${commentPaddingStr.repeat(commentPadding.inline)}${getCommentChars().inline.end}`.trimEnd()
                        })
                        break
                    case 'block':
                        if (commentPadding.block > 0) {
                            figletTextArr.unshift('\n'.repeat(commentPadding.block - 1))
                            figletTextArr.push('\n'.repeat(commentPadding.block - 1))
                        }
                        figletTextArr.unshift(getCommentChars().block.start)
                        figletTextArr.push(getCommentChars().block.end)
                        break
                }
            }

            // add margins if the option is enabled
            if (marginsEnabled) {
                // subtract one; Array.prototype.join('\n') before editor output
                if (prependNewLines > 0) figletTextArr = [`${'\n'.repeat(prependNewLines - 1)}`].concat(figletTextArr)
                if (appendNewLines > 0) figletTextArr = figletTextArr.concat([`${'\n'.repeat(appendNewLines)}`])
            }

            // indent subsequent lines after the first if
            // the line with the selection was indented
            if (!indentRange.empty) {
                figletTextArr = figletTextArr.map((line, index) => {
                    if (index === 0) return `${line}`
                    return `${indentText}${line}`
                })
            }

            // convert the array of strings to a
            // single string for output to editor
            let figletTextStr = figletTextArr.join('\n')

            // replace the selection with the fully transformed FIGlet text
            editor.edit(e => { e.replace(range, figletTextStr) })

            // deselect and position the cursor
            editor.moveRight(1)
        })
    }
})


// FIGlet convert the preview text in the extension config
nova.commands.register('figletTextFontPreview', workspace => {
    let figConfig = {
        kerning: '-k',
        outputWidth: '-w' + 2000
    }

    let text = nova.config.get('figlet_text.previewText', 'string')

    nova.commands.invoke('figlet', figConfig, text, figletText => {
        nova.config.set('figlet_text.preview', figletText)
    })
})
// listen for changes to the Font selection dropdown in the extension config
nova.config.onDidChange('figlet_text.font', (newValue, oldValue) => {
    nova.commands.invoke('figletTextFontPreview')
})
// listen for changes to the Preview Text input in the extension config
nova.config.onDidChange('figlet_text.previewText', (newValue, oldValue) => {
    nova.commands.invoke('figletTextFontPreview')
})


// preview all installed FIGlet distributed fonts in an new editor
nova.commands.register('figletTextFontPreviewAll', workspace => {
    workspace.showActionPanel('Select a Font Collection', {buttons: ['FIGlet', 'BDF', 'C64', 'Cancel']}, actionValue => {
        // panel was canceled
        if (actionValue === 3) return

        const fontSubDir = (() => {
            switch (actionValue) {
                case 0:
                    return ''
                case 1:
                    return 'bdffonts'
                case 2:
                    return 'C64-fonts'
            }
        })()

        let message = 'Enter a custom preview text. Leave blank to use the font name for each font preview text output.'
        let options = {label: 'Preview Text', placeholder: 'Use Font Name', prompt: 'Generate Previews'}
        workspace.showInputPanel(message, options, inputValue => {
            // panel was canceled
            if (typeof inputValue === 'undefined') return

            const process = new Process('/usr/bin/env', {args: ['showfigfonts', '-d', '/usr/local/Cellar/figlet/2.2.5/share/figlet/fonts/' + fontSubDir, inputValue]})

            let preview = ''
            process.onStdout(line => {
                preview += line
            })

            process.onDidExit(status => {
                if (status === 0) {
                    workspace.openFile(nova.fs.tempdir + '/FIGlet Text | Font Collection Preview.txt')
                    .then(editor => {
                        editor.edit(e => { e.insert(0, preview) })
                        editor.scrollToPosition(0)
                    })
                }
            })

            process.start()
        })
    })
})
