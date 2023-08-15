## AwakeTiger


awake 라는 telegram 공시중, 특정 보고서를 추리기 위한 tool

어떤 보고서 이름을 추리는지는 `this.reportNameRegex`를 확인하자.

### 실행방법

`stockcode.json`을 필요로 한다. 이 file 은 `npm run --- -cl <file_path>` 를 하면 생성할 수 있다. 이 file은 <https://kind.krx.co.kr/corpgeneral/corpList.do?method=loadInitPage>에서 받으면 된다.


1. `stockcode.json`생성
    1. <https://kind.krx.co.kr/corpgeneral/corpList.do?method=loadInitPage> 에 가서 download
    2. `npm run --- -cl <file_path>`
2. `npm run prod -- -f <file_path> -o <output_file_path>`

### 동작

기본적으로 다음 동작을 한다.

1. 분기보고서를 추린다.
2. 추린 보고서중에 매출액, 영업이익이 yoy 증가한 기업을 찾는다.
3. 찾은 내용을 table 형식으로 저장해준다.


